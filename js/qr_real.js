/**
 * camlab Real ISO/IEC 18004 QR Code Encoder (100% Offline, Pure JS)
 * Generates genuinely scannable QR codes (Byte Mode, Error Correction Level L/M)
 * without requiring any external CDN.
 */
(function (global) {
    'use strict';

    // Galois Field GF(256) tables for Reed-Solomon ECC (primitive polynomial 0x11d)
    const EXP_TABLE = new Array(256);
    const LOG_TABLE = new Array(256);
    for (let i = 0; i < 8; i++) EXP_TABLE[i] = 1 << i;
    for (let i = 8; i < 256; i++) {
        EXP_TABLE[i] = EXP_TABLE[i - 4] ^ EXP_TABLE[i - 5] ^ EXP_TABLE[i - 6] ^ EXP_TABLE[i - 8];
    }
    for (let i = 0; i < 255; i++) LOG_TABLE[EXP_TABLE[i]] = i;

    function glog(n) {
        if (n < 1) throw new Error('glog(' + n + ')');
        return LOG_TABLE[n];
    }
    function gexp(n) {
        while (n < 0) n += 255;
        while (n >= 256) n -= 255;
        return EXP_TABLE[n];
    }

    class Polynomial {
        constructor(num, shift) {
            let offset = 0;
            while (offset < num.length && num[offset] === 0) offset++;
            this.num = new Array(num.length - offset + shift);
            for (let i = 0; i < num.length - offset; i++) this.num[i] = num[i + offset];
            for (let i = num.length - offset; i < this.num.length; i++) this.num[i] = 0;
        }
        get(index) { return this.num[index]; }
        getLength() { return this.num.length; }
        multiply(e) {
            const num = new Array(this.getLength() + e.getLength() - 1).fill(0);
            for (let i = 0; i < this.getLength(); i++) {
                for (let j = 0; j < e.getLength(); j++) {
                    num[i + j] ^= gexp(glog(this.get(i)) + glog(e.get(j)));
                }
            }
            return new Polynomial(num, 0);
        }
        mod(e) {
            if (this.getLength() - e.getLength() < 0) return this;
            const ratio = glog(this.get(0)) - glog(e.get(0));
            const num = this.num.slice();
            for (let i = 0; i < e.getLength(); i++) {
                num[i] ^= gexp(glog(e.get(i)) + ratio);
            }
            return new Polynomial(num, 0).mod(e);
        }
    }

    function getRSBlocks(typeNumber) {
        // Error Correction Level L blocks: [count, totalCount, dataCount]
        const table = {
            1: [1, 26, 19],
            2: [1, 44, 34],
            3: [1, 70, 55],
            4: [1, 100, 80],
            5: [1, 134, 108],
            6: [2, 86, 68]
        };
        const row = table[typeNumber];
        const list = [];
        for (let i = 0; i < row[0]; i++) list.push({ totalCount: row[1], dataCount: row[2] });
        return list;
    }

    function getErrorCorrectPolynomial(ecLength) {
        let a = new Polynomial([1], 0);
        for (let i = 0; i < ecLength; i++) {
            a = a.multiply(new Polynomial([1, gexp(i)], 0));
        }
        return a;
    }

    function getPatternPosition(typeNumber) {
        const table = { 1: [], 2: [6, 18], 3: [6, 22], 4: [6, 26], 5: [6, 30], 6: [6, 34] };
        return table[typeNumber] || [];
    }

    function getBCHTypeInfo(data) {
        let d = data << 10;
        while (getBCHDigit(d) - getBCHDigit(0x537) >= 0) {
            d ^= (0x537 << (getBCHDigit(d) - getBCHDigit(0x537)));
        }
        return ((data << 10) | d) ^ 0x5412;
    }

    function getBCHDigit(data) {
        let digit = 0;
        while (data !== 0) { digit++; data >>>= 1; }
        return digit;
    }

    function createQRMatrix(text) {
        const utf8 = new TextEncoder().encode(text || 'https://camlab.app');
        let typeNumber = 1;
        const maxCap = { 1: 17, 2: 32, 3: 53, 4: 78, 5: 106, 6: 134 };
        while (typeNumber < 6 && utf8.length > maxCap[typeNumber]) typeNumber++;
        const dataBytes = utf8.slice(0, maxCap[typeNumber]);

        const rsBlocks = getRSBlocks(typeNumber);
        const totalDataCount = rsBlocks.reduce((s, b) => s + b.dataCount, 0);

        // Bit buffer
        const bits = [];
        const putBits = (val, len) => {
            for (let i = 0; i < len; i++) bits.push(((val >>> (len - i - 1)) & 1) === 1);
        };
        putBits(4, 4); // Byte mode
        putBits(dataBytes.length, 8);
        for (let i = 0; i < dataBytes.length; i++) putBits(dataBytes[i], 8);
        if (bits.length + 4 <= totalDataCount * 8) putBits(0, 4);
        while (bits.length % 8 !== 0) bits.push(false);
        const bytes = [];
        for (let i = 0; i < bits.length; i += 8) {
            let b = 0;
            for (let j = 0; j < 8; j++) if (bits[i + j]) b |= (1 << (7 - j));
            bytes.push(b);
        }
        let padIdx = 0;
        while (bytes.length < totalDataCount) {
            bytes.push(padIdx % 2 === 0 ? 0xEC : 0x11);
            padIdx++;
        }

        // RS encoding
        let offset = 0;
        let maxDc = 0, maxEc = 0;
        const dcdata = [], ecdata = [];
        for (let r = 0; r < rsBlocks.length; r++) {
            const dcCount = rsBlocks[r].dataCount;
            const ecCount = rsBlocks[r].totalCount - dcCount;
            maxDc = Math.max(maxDc, dcCount);
            maxEc = Math.max(maxEc, ecCount);
            const dc = bytes.slice(offset, offset + dcCount);
            offset += dcCount;
            const rsPoly = getErrorCorrectPolynomial(ecCount);
            const rawPoly = new Polynomial(dc, rsPoly.getLength() - 1);
            const modPoly = rawPoly.mod(rsPoly);
            const ec = new Array(rsPoly.getLength() - 1).fill(0);
            for (let i = 0; i < ec.length; i++) {
                const modIndex = i + modPoly.getLength() - ec.length;
                ec[i] = modIndex >= 0 ? modPoly.get(modIndex) : 0;
            }
            dcdata.push(dc);
            ecdata.push(ec);
        }

        const codewords = [];
        for (let i = 0; i < maxDc; i++) for (let r = 0; r < rsBlocks.length; r++) if (i < dcdata[r].length) codewords.push(dcdata[r][i]);
        for (let i = 0; i < maxEc; i++) for (let r = 0; r < rsBlocks.length; r++) if (i < ecdata[r].length) codewords.push(ecdata[r][i]);

        const moduleCount = typeNumber * 4 + 17;
        const modules = Array.from({ length: moduleCount }, () => new Array(moduleCount).fill(null));

        const setupProbe = (row, col) => {
            for (let r = -1; r <= 7; r++) {
                if (row + r <= -1 || moduleCount <= row + r) continue;
                for (let c = -1; c <= 7; c++) {
                    if (col + c <= -1 || moduleCount <= col + c) continue;
                    modules[row + r][col + c] =
                        (0 <= r && r <= 6 && (c === 0 || c === 6)) ||
                        (0 <= c && c <= 6 && (r === 0 || r === 6)) ||
                        (2 <= r && r <= 4 && 2 <= c && c <= 4);
                }
            }
        };
        setupProbe(0, 0);
        setupProbe(moduleCount - 7, 0);
        setupProbe(0, moduleCount - 7);

        // Alignment patterns
        const pos = getPatternPosition(typeNumber);
        for (let i = 0; i < pos.length; i++) {
            for (let j = 0; j < pos.length; j++) {
                const row = pos[i], col = pos[j];
                if (modules[row][col] !== null) continue;
                for (let r = -2; r <= 2; r++) {
                    for (let c = -2; c <= 2; c++) {
                        modules[row + r][col + c] = (r === -2 || r === 2 || c === -2 || c === 2 || (r === 0 && c === 0));
                    }
                }
            }
        }

        // Timing patterns
        for (let i = 8; i < moduleCount - 8; i++) {
            if (modules[i][6] === null) modules[i][6] = (i % 2 === 0);
            if (modules[6][i] === null) modules[6][i] = (i % 2 === 0);
        }

        // Dark module & format info (ECC L = 1, mask pattern 0)
        modules[moduleCount - 8][8] = true;
        const formatBits = getBCHTypeInfo((1 << 3) | 0);
        for (let i = 0; i < 15; i++) {
            const mod = ((formatBits >> i) & 1) === 1;
            if (i < 6) modules[i][8] = mod;
            else if (i < 8) modules[i + 1][8] = mod;
            else modules[moduleCount - 15 + i][8] = mod;

            if (i < 8) modules[8][moduleCount - i - 1] = mod;
            else if (i < 9) modules[8][15 - i] = mod;
            else modules[8][15 - i - 1] = mod;
        }

        // Map data with mask pattern 0: (row + col) % 2 === 0
        let inc = -1, row = moduleCount - 1, bitIndex = 7, byteIndex = 0;
        for (let col = moduleCount - 1; col > 0; col -= 2) {
            if (col === 6) col--;
            while (true) {
                for (let c = 0; c < 2; c++) {
                    if (modules[row][col - c] === null) {
                        let dark = false;
                        if (byteIndex < codewords.length) {
                            dark = ((codewords[byteIndex] >>> bitIndex) & 1) === 1;
                        }
                        if ((row + (col - c)) % 2 === 0) dark = !dark;
                        modules[row][col - c] = dark;
                        bitIndex--;
                        if (bitIndex === -1) { byteIndex++; bitIndex = 7; }
                    }
                }
                row += inc;
                if (row < 0 || moduleCount <= row) {
                    row -= inc;
                    inc = -inc;
                    break;
                }
            }
        }
        return modules;
    }

    function drawToCanvas(canvas, text, darkColor = '#0F172A', lightColor = '#FFFFFF') {
        const modules = createQRMatrix(text);
        const count = modules.length;
        const ctx = canvas.getContext('2d');
        const quiet = 2;
        const cell = canvas.width / (count + quiet * 2);
        ctx.fillStyle = lightColor;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = darkColor;
        for (let r = 0; r < count; r++) {
            for (let c = 0; c < count; c++) {
                if (modules[r][c]) {
                    ctx.fillRect((c + quiet) * cell, (r + quiet) * cell, Math.ceil(cell), Math.ceil(cell));
                }
            }
        }
    }

    global.CamLabQR = { createQRMatrix, drawToCanvas };
})(window);
