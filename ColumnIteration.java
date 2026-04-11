import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.Random;
import java.util.Scanner;

/**
 * Iteration process over randomly chosen column templates Z1..Z16,
 * derived columns C1..C16, and checks on C15, C20, and C17.
 */
public class ColumnIteration {

    private static final Random RNG = new Random();

    /** X = false, Y = true — addition: Y+Y=Y, Y+X=X, X+X=Y (same → Y, different → X). */
    private static boolean add(boolean a, boolean b) {
        return a == b;
    }

    private static boolean[] addCols(boolean[] a, boolean[] b) {
        boolean[] out = new boolean[4];
        for (int i = 0; i < 4; i++) {
            out[i] = add(a[i], b[i]);
        }
        return out;
    }

    private static boolean[] addCols(boolean[] a, boolean[] b, boolean[] c, boolean[] d) {
        return addCols(addCols(a, b), addCols(c, d));
    }

    private static boolean equalsCol(boolean[] a, boolean[] b) {
        return Arrays.equals(a, b);
    }

    private static String rowString(boolean[] c0, boolean[] c1, boolean[] c2, boolean[] c3) {
        StringBuilder sb = new StringBuilder();
        for (int r = 0; r < 4; r++) {
            sb.append(sym(c0[r])).append(' ').append(sym(c1[r])).append(' ')
                    .append(sym(c2[r])).append(' ').append(sym(c3[r])).append('\n');
        }
        return sb.toString();
    }

    private static char sym(boolean y) {
        return y ? 'Y' : 'X';
    }

    private static String formatCol(boolean[] c) {
        StringBuilder sb = new StringBuilder();
        for (int i = 0; i < 4; i++) {
            sb.append(sym(c[i])).append('\n');
        }
        return sb.toString().trim();
    }

    private static String formatColLabeled(String label, boolean[] c) {
        return label + ":\n" + formatCol(c);
    }

    public static void main(String[] args) {
        // Z1 .. Z16 (top to bottom in each column), X=false, Y=true
        boolean[][] z = new boolean[][] {
                { false, false, false, false }, // Z1
                { true, false, true, false },   // Z2
                { false, true, false, false },  // Z3
                { true, false, false, true },   // Z4
                { true, true, true, false },    // Z5
                { true, true, false, true },    // Z6
                { true, false, false, false },  // Z7
                { true, true, false, false },   // Z8
                { false, false, true, true },   // Z9
                { false, false, false, true },  // Z10
                { true, false, true, true },    // Z11
                { false, true, true, true },    // Z12
                { false, true, true, false },   // Z13
                { false, false, true, false },  // Z14
                { false, true, false, true },   // Z15
                { true, true, true, true }      // Z16
        };

        Scanner in = new Scanner(System.in);
        System.out.print("Enter the number of iterations L: ");
        int l = in.nextInt();
        in.nextLine();
        System.out.println("Number of iterations L = " + l);

        for (int iter = 1; iter <= l; iter++) {
            runIteration(iter, z);
        }
        System.out.println("END.");
    }

    /**
     * C1..C4 copied from right to left of the row layout (C4 C3 C2 C1) into C5..C8
     * so that display order C8 C7 C6 C5 matches C4,C3,C2,C1 respectively (same vectors).
     */
    private static void copyC5toC8(boolean[] c1, boolean[] c2, boolean[] c3, boolean[] c4,
            boolean[] c5, boolean[] c6, boolean[] c7, boolean[] c8) {
        System.arraycopy(c4, 0, c8, 0, 4);
        System.arraycopy(c3, 0, c7, 0, 4);
        System.arraycopy(c2, 0, c6, 0, 4);
        System.arraycopy(c1, 0, c5, 0, 4);
    }

    private static void runIteration(int iter, boolean[][] z) {
        boolean[] c1 = new boolean[4];
        boolean[] c2 = new boolean[4];
        boolean[] c3 = new boolean[4];
        boolean[] c4 = new boolean[4];

        while (true) {
            // START: pick four distinct templates Z_k for C1..C4
            pickFourDistinct(z, c1, c2, c3, c4);

            System.out.println("\n--- Iteration " + iter + " ---");
            System.out.println("C4  C3  C2  C1");
            System.out.print(rowString(c4, c3, c2, c1));

            boolean[] c5 = new boolean[4];
            boolean[] c6 = new boolean[4];
            boolean[] c7 = new boolean[4];
            boolean[] c8 = new boolean[4];
            copyC5toC8(c1, c2, c3, c4, c5, c6, c7, c8);

            boolean[] c9 = addCols(c1, c2);
            boolean[] c10 = addCols(c3, c4);
            boolean[] c11 = addCols(c5, c6);
            boolean[] c12 = addCols(c7, c8);
            boolean[] c13 = addCols(c9, c10);
            boolean[] c14 = addCols(c11, c12);
            boolean[] c15 = addCols(c13, c14);
            boolean[] c16 = addCols(c15, c1);

            boolean[][] c = new boolean[][] { c1, c2, c3, c4, c5, c6, c7, c8, c9, c10, c11, c12, c13, c14, c15, c16 };

            System.out.println("C8 C7 C6 C5");
            System.out.print(rowString(c8, c7, c6, c5));

            // If C15 is Z1, Z7, or Z11, go to START (same iteration)
            if (equalsCol(c15, z[0]) || equalsCol(c15, z[6]) || equalsCol(c15, z[10])) {
                System.out.println("C15 matches Z1, Z7, or Z11 — restarting START for this iteration.");
                continue;
            }

            boolean[] c17 = addCols(c1, c4, c7, c8);
            boolean[] c20 = addCols(c3, c7, c11, c15);

            boolean[] z1 = z[0];
            boolean[] z6 = z[5];
            boolean[] z10 = z[9];
            boolean[] z15col = z[14];

            boolean c20Special = equalsCol(c20, z1) || equalsCol(c20, z6) || equalsCol(c20, z10) || equalsCol(c20, z15col);
            if (!c20Special) {
                System.out.println("C20 = Nil");
                break; // next outer iteration if any
            }
            System.out.println("C20:\n" + formatCol(c20));

            List<Integer> matches = new ArrayList<>();
            for (int i = 0; i < 16; i++) {
                if (equalsCol(c17, c[i])) {
                    matches.add(i + 1);
                }
            }
            if (!matches.isEmpty()) {
                System.out.println("Iteration " + iter + " — C17 matches column(s) among C1..C16:");
                System.out.println("C17:\n" + formatCol(c17));
                System.out.println("Equal to: " + matches);
            }

            break;
        }
    }

    /** Choose four distinct indices into z and copy into c1..c4. */
    private static void pickFourDistinct(boolean[][] z, boolean[] c1, boolean[] c2, boolean[] c3, boolean[] c4) {
        List<Integer> idx = new ArrayList<>();
        for (int i = 0; i < 16; i++) {
            idx.add(i);
        }
        // shuffle
        for (int i = idx.size() - 1; i > 0; i--) {
            int j = RNG.nextInt(i + 1);
            int t = idx.get(i);
            idx.set(i, idx.get(j));
            idx.set(j, t);
        }
        System.arraycopy(z[idx.get(0)], 0, c1, 0, 4);
        System.arraycopy(z[idx.get(1)], 0, c2, 0, 4);
        System.arraycopy(z[idx.get(2)], 0, c3, 0, 4);
        System.arraycopy(z[idx.get(3)], 0, c4, 0, 4);
    }
}
