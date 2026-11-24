package com.transittwin.geo;

import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Deque;
import java.util.List;

/** Douglas-Peucker line simplification. Tolerance is in the points' own units (degrees here). */
public final class LineSimplifier {

    private LineSimplifier() {
    }

    /** Returns a new list; endpoints are always kept and the input is never modified. */
    public static List<LonLat> simplify(List<LonLat> points, double tolerance) {
        int n = points.size();
        if (n <= 2) {
            return new ArrayList<>(points);
        }
        boolean[] keep = new boolean[n];
        keep[0] = true;
        keep[n - 1] = true;
        Deque<int[]> stack = new ArrayDeque<>();
        stack.push(new int[] {0, n - 1});

        while (!stack.isEmpty()) {
            int[] span = stack.pop();
            int a = span[0];
            int b = span[1];
            double maxDist = 0;
            int index = -1;
            for (int i = a + 1; i < b; i++) {
                double d = distToSegment(points.get(i), points.get(a), points.get(b));
                if (d > maxDist) {
                    maxDist = d;
                    index = i;
                }
            }
            if (index != -1 && maxDist > tolerance) {
                keep[index] = true;
                stack.push(new int[] {a, index});
                stack.push(new int[] {index, b});
            }
        }
        List<LonLat> out = new ArrayList<>();
        for (int i = 0; i < n; i++) {
            if (keep[i]) {
                out.add(points.get(i));
            }
        }
        return out;
    }

    private static double distToSegment(LonLat p, LonLat a, LonLat b) {
        double dx = b.lon() - a.lon();
        double dy = b.lat() - a.lat();
        double len2 = dx * dx + dy * dy;
        double t = len2 == 0 ? 0 : ((p.lon() - a.lon()) * dx + (p.lat() - a.lat()) * dy) / len2;
        t = Math.max(0, Math.min(1, t));
        return Math.hypot(p.lon() - (a.lon() + t * dx), p.lat() - (a.lat() + t * dy));
    }
}
