package com.camlab.studio;

import android.content.Context;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;
import android.graphics.Path;
import android.graphics.PointF;
import android.graphics.RectF;
import android.util.AttributeSet;
import android.view.MotionEvent;
import android.view.View;

/**
 * Interactive 4-corner perspective crop overlay (CamScanner-style draggable handles).
 */
public class CornerCropView extends View {

    private Bitmap image;
    private final RectF imageRect = new RectF();
    private final PointF[] corners = new PointF[]{
            new PointF(0.08f, 0.08f),
            new PointF(0.92f, 0.08f),
            new PointF(0.92f, 0.92f),
            new PointF(0.08f, 0.92f)
    };
    private int activeHandle = -1;

    private final Paint bmpPaint = new Paint(Paint.ANTI_ALIAS_FLAG | Paint.FILTER_BITMAP_FLAG);
    private final Paint shadePaint = new Paint();
    private final Paint linePaint = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Paint handleFillPaint = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Paint handleStrokePaint = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Path polyPath = new Path();

    public CornerCropView(Context context) {
        super(context);
        init();
    }

    public CornerCropView(Context context, AttributeSet attrs) {
        super(context, attrs);
        init();
    }

    private void init() {
        shadePaint.setColor(Color.argb(120, 15, 23, 42));
        shadePaint.setStyle(Paint.Style.FILL);

        linePaint.setColor(Color.parseColor("#00E6B8"));
        linePaint.setStyle(Paint.Style.STROKE);
        linePaint.setStrokeWidth(5f);

        handleFillPaint.setColor(Color.parseColor("#00A884"));
        handleFillPaint.setStyle(Paint.Style.FILL);

        handleStrokePaint.setColor(Color.WHITE);
        handleStrokePaint.setStyle(Paint.Style.STROKE);
        handleStrokePaint.setStrokeWidth(4f);
    }

    public void setImageAndCorners(Bitmap bmp, PointF[] normQuad) {
        this.image = bmp;
        if (normQuad != null && normQuad.length == 4) {
            for (int i = 0; i < 4; i++) {
                corners[i] = new PointF(
                        Math.max(0f, Math.min(1f, normQuad[i].x)),
                        Math.max(0f, Math.min(1f, normQuad[i].y))
                );
            }
        } else {
            corners[0] = new PointF(0.06f, 0.06f);
            corners[1] = new PointF(0.94f, 0.06f);
            corners[2] = new PointF(0.94f, 0.94f);
            corners[3] = new PointF(0.06f, 0.94f);
        }
        invalidate();
    }

    public PointF[] getNormalizedCorners() {
        PointF[] out = new PointF[4];
        for (int i = 0; i < 4; i++) {
            out[i] = new PointF(corners[i].x, corners[i].y);
        }
        return out;
    }

    @Override
    protected void onDraw(Canvas canvas) {
        super.onDraw(canvas);
        int vw = getWidth(), vh = getHeight();
        if (image == null || vw <= 0 || vh <= 0) return;

        float pad = 28f;
        float availW = vw - pad * 2f;
        float availH = vh - pad * 2f;
        float sc = Math.min(availW / image.getWidth(), availH / image.getHeight());
        float dw = image.getWidth() * sc;
        float dh = image.getHeight() * sc;
        float ox = (vw - dw) * 0.5f;
        float oy = (vh - dh) * 0.5f;
        imageRect.set(ox, oy, ox + dw, oy + dh);

        canvas.drawBitmap(image, null, imageRect, bmpPaint);

        float[] sx = new float[4];
        float[] sy = new float[4];
        for (int i = 0; i < 4; i++) {
            sx[i] = ox + corners[i].x * dw;
            sy[i] = oy + corners[i].y * dh;
        }

        polyPath.reset();
        polyPath.moveTo(sx[0], sy[0]);
        polyPath.lineTo(sx[1], sy[1]);
        polyPath.lineTo(sx[2], sy[2]);
        polyPath.lineTo(sx[3], sy[3]);
        polyPath.close();

        canvas.drawPath(polyPath, linePaint);

        for (int i = 0; i < 4; i++) {
            float r = (i == activeHandle) ? 24f : 18f;
            canvas.drawCircle(sx[i], sy[i], r, handleFillPaint);
            canvas.drawCircle(sx[i], sy[i], r, handleStrokePaint);
        }
    }

    @Override
    public boolean onTouchEvent(MotionEvent event) {
        if (image == null || imageRect.width() <= 0 || imageRect.height() <= 0) return false;
        float x = event.getX();
        float y = event.getY();

        switch (event.getAction()) {
            case MotionEvent.ACTION_DOWN:
                activeHandle = -1;
                float bestDist = 90f;
                for (int i = 0; i < 4; i++) {
                    float hx = imageRect.left + corners[i].x * imageRect.width();
                    float hy = imageRect.top + corners[i].y * imageRect.height();
                    float d = (float) Math.hypot(x - hx, y - hy);
                    if (d < bestDist) {
                        bestDist = d;
                        activeHandle = i;
                    }
                }
                invalidate();
                return activeHandle != -1;
            case MotionEvent.ACTION_MOVE:
                if (activeHandle >= 0) {
                    float nx = Math.max(0f, Math.min(1f, (x - imageRect.left) / imageRect.width()));
                    float ny = Math.max(0f, Math.min(1f, (y - imageRect.top) / imageRect.height()));
                    corners[activeHandle].set(nx, ny);
                    invalidate();
                    return true;
                }
                break;
            case MotionEvent.ACTION_UP:
            case MotionEvent.ACTION_CANCEL:
                activeHandle = -1;
                invalidate();
                return true;
        }
        return super.onTouchEvent(event);
    }
}
