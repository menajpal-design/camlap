package com.camlab.studio;

import android.content.Context;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;
import android.graphics.Path;
import android.graphics.PointF;
import android.util.AttributeSet;
import android.view.View;

/**
 * Real-time CamScanner-style 4-corner document detection overlay & 3x3 grid.
 */
public class LiveQuadOverlayView extends View {

    private PointF[] normalizedQuad = null; // 4 corners in [0..1] frame coordinates
    private int frameW = 0;
    private int frameH = 0;
    private boolean isLocked = false;
    private boolean showGrid = true;

    private final Paint fillPaint = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Paint strokePaint = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Paint cornerPaint = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Paint gridPaint = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Path quadPath = new Path();

    public LiveQuadOverlayView(Context context) {
        super(context);
        init();
    }

    public LiveQuadOverlayView(Context context, AttributeSet attrs) {
        super(context, attrs);
        init();
    }

    private void init() {
        fillPaint.setStyle(Paint.Style.FILL);
        fillPaint.setColor(Color.argb(42, 0, 230, 184));

        strokePaint.setStyle(Paint.Style.STROKE);
        strokePaint.setStrokeWidth(6f);
        strokePaint.setColor(Color.parseColor("#00E6B8"));

        cornerPaint.setStyle(Paint.Style.FILL);
        cornerPaint.setColor(Color.parseColor("#00E6B8"));

        gridPaint.setStyle(Paint.Style.STROKE);
        gridPaint.setStrokeWidth(1.5f);
        gridPaint.setColor(Color.argb(70, 255, 255, 255));
    }

    public void setShowGrid(boolean show) {
        this.showGrid = show;
        invalidate();
    }

    public boolean isShowGrid() {
        return showGrid;
    }

    public void setDetectedQuad(PointF[] quad, boolean locked) {
        setDetectedQuad(quad, locked, 0, 0);
    }

    public void setDetectedQuad(PointF[] quad, boolean locked, int srcFrameW, int srcFrameH) {
        this.normalizedQuad = quad;
        this.isLocked = locked;
        this.frameW = srcFrameW;
        this.frameH = srcFrameH;
        if (locked) {
            fillPaint.setColor(Color.argb(70, 16, 185, 129));
            strokePaint.setColor(Color.parseColor("#10B981"));
            strokePaint.setStrokeWidth(8f);
            cornerPaint.setColor(Color.WHITE);
        } else {
            fillPaint.setColor(Color.argb(42, 0, 230, 184));
            strokePaint.setColor(Color.parseColor("#00E6B8"));
            strokePaint.setStrokeWidth(6f);
            cornerPaint.setColor(Color.parseColor("#00E6B8"));
        }
        postInvalidate();
    }

    @Override
    protected void onDraw(Canvas canvas) {
        super.onDraw(canvas);
        int w = getWidth();
        int h = getHeight();
        if (w <= 0 || h <= 0) return;

        if (showGrid) {
            canvas.drawLine(w / 3f, 0, w / 3f, h, gridPaint);
            canvas.drawLine(2f * w / 3f, 0, 2f * w / 3f, h, gridPaint);
            canvas.drawLine(0, h / 3f, w, h / 3f, gridPaint);
            canvas.drawLine(0, 2f * h / 3f, w, 2f * h / 3f, gridPaint);
        }

        if (normalizedQuad != null && normalizedQuad.length == 4) {
            float dispW = w;
            float dispH = h;
            float offX = 0f;
            float offY = 0f;
            if (frameW > 0 && frameH > 0) {
                float sc = Math.max((float) w / frameW, (float) h / frameH);
                dispW = frameW * sc;
                dispH = frameH * sc;
                offX = (w - dispW) * 0.5f;
                offY = (h - dispH) * 0.5f;
            }
            quadPath.reset();
            quadPath.moveTo(offX + normalizedQuad[0].x * dispW, offY + normalizedQuad[0].y * dispH);
            quadPath.lineTo(offX + normalizedQuad[1].x * dispW, offY + normalizedQuad[1].y * dispH);
            quadPath.lineTo(offX + normalizedQuad[2].x * dispW, offY + normalizedQuad[2].y * dispH);
            quadPath.lineTo(offX + normalizedQuad[3].x * dispW, offY + normalizedQuad[3].y * dispH);
            quadPath.close();

            canvas.drawPath(quadPath, fillPaint);
            canvas.drawPath(quadPath, strokePaint);

            for (PointF pt : normalizedQuad) {
                canvas.drawCircle(offX + pt.x * dispW, offY + pt.y * dispH, isLocked ? 15f : 11f, cornerPaint);
            }
        }
    }
}

