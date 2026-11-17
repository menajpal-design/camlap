package com.camlab.studio;

import android.content.Context;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;
import android.graphics.Path;
import android.util.AttributeSet;
import android.view.MotionEvent;
import android.view.View;

public class SignaturePadView extends View {
    private final Path path = new Path();
    private final Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG);
    private boolean hasInk = false;

    public SignaturePadView(Context context) {
        super(context);
        init();
    }

    public SignaturePadView(Context context, AttributeSet attrs) {
        super(context, attrs);
        init();
    }

    private void init() {
        paint.setColor(Color.parseColor("#0F172A"));
        paint.setStyle(Paint.Style.STROKE);
        paint.setStrokeWidth(7f);
        paint.setStrokeCap(Paint.Cap.ROUND);
        paint.setStrokeJoin(Paint.Join.ROUND);
    }

    @Override
    protected void onDraw(Canvas canvas) {
        super.onDraw(canvas);
        canvas.drawPath(path, paint);
    }

    @Override
    public boolean onTouchEvent(MotionEvent event) {
        float x = event.getX();
        float y = event.getY();
        getParent().requestDisallowInterceptTouchEvent(true);
        switch (event.getAction()) {
            case MotionEvent.ACTION_DOWN:
                path.moveTo(x, y);
                hasInk = true;
                invalidate();
                return true;
            case MotionEvent.ACTION_MOVE:
                path.lineTo(x, y);
                hasInk = true;
                invalidate();
                return true;
            default:
                return super.onTouchEvent(event);
        }
    }

    public void clear() {
        path.reset();
        hasInk = false;
        invalidate();
    }

    public boolean hasSignature() {
        return hasInk;
    }

    public Bitmap exportSignatureBitmap() {
        if (!hasInk || getWidth() <= 0 || getHeight() <= 0) return null;
        Bitmap bmp = Bitmap.createBitmap(getWidth(), getHeight(), Bitmap.Config.ARGB_8888);
        Canvas c = new Canvas(bmp);
        c.drawPath(path, paint);
        return bmp;
    }
}
