// MapLoadProbe — how far does WarsmashModEngine get loading a .w3x with NO
// renderer and NO Warcraft III game data?
//
// Usage:
//   java -cp "probe:$(cat $WORK/classpath.txt)" MapLoadProbe <map.w3x> [gameDataDir ...]
//
// Every extra argument is layered into the Warsmash CompoundDataSource the way
// warsmash.ini's [DataSources] block would be — point it at a folder holding
// Units\*.slk, UI\*.txt, Scripts\common.j etc. extracted from a legitimately
// owned Warcraft III install to get past the last step. Nothing here downloads
// or ships Blizzard data.
//
// Measured result with NO game data (Fall of Rome 1.06, 2026-08-10): every step
// PASSes except readModifications, which NPEs in WorldEditStrings because
// UI\WorldEditStrings.txt is absent. That single line is the game-data wall.
import java.io.File;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;

import com.etheller.warsmash.datasources.DataSource;
import com.etheller.warsmash.datasources.DataSourceDescriptor;
import com.etheller.warsmash.datasources.CompoundDataSourceDescriptor;
import com.etheller.warsmash.datasources.FolderDataSourceDescriptor;
import com.etheller.warsmash.parsers.w3x.War3Map;
import com.etheller.warsmash.parsers.w3x.unitsdoo.War3MapUnitsDoo;
import com.etheller.warsmash.parsers.w3x.w3e.War3MapW3e;
import com.etheller.warsmash.parsers.w3x.w3i.War3MapW3i;
import com.etheller.warsmash.parsers.w3x.wpm.War3MapWpm;

public class MapLoadProbe {
	private static int failures = 0;

	interface Step {
		void run() throws Exception;
	}

	static void step(final String name, final Step s) {
		try {
			s.run();
			System.out.println("PASS  " + name);
		}
		catch (final Throwable t) {
			failures++;
			System.out.println("FAIL  " + name + " -> " + t.getClass().getSimpleName() + ": " + t.getMessage());
			Throwable cause = t;
			while (cause.getCause() != null) {
				cause = cause.getCause();
			}
			final StackTraceElement[] st = cause.getStackTrace();
			for (int i = 0; i < Math.min(6, st.length); i++) {
				System.out.println("        at " + st[i]);
			}
		}
	}

	public static void main(final String[] args) throws Exception {
		if (args.length < 1) {
			System.err.println("usage: MapLoadProbe <map.w3x> [gameDataDir ...]");
			System.exit(2);
		}
		final File map = new File(args[0]).getAbsoluteFile();
		final List<DataSourceDescriptor> layers = new ArrayList<>();
		layers.add(new FolderDataSourceDescriptor(map.getParent()));
		for (int i = 1; i < args.length; i++) {
			layers.add(new FolderDataSourceDescriptor(args[i]));
		}
		final DataSource ds = new CompoundDataSourceDescriptor(layers).createDataSource();
		final War3Map w3x = new War3Map(ds, map.getName());
		final War3MapW3i[] w3i = new War3MapW3i[1];

		step("open .w3x (Warsmash's own MPQ reader, no StormLib)", () -> {
		});
		step("readMapInformation (w3i)", () -> {
			w3i[0] = w3x.readMapInformation();
			System.out.println("      w3i version=" + w3i[0].getVersion() + " name='" + w3i[0].getName() + "' players="
					+ w3i[0].getPlayers().size() + " forces=" + w3i[0].getForces().size() + " flags="
					+ w3i[0].getFlags());
		});
		step("readEnvironment (w3e terrain)", () -> {
			final War3MapW3e e = w3x.readEnvironment();
			System.out.println("      w3e mapSize=" + Arrays.toString(e.getMapSize()));
		});
		step("readPathing (wpm -> PathingGrid, the sim's only terrain input)", () -> {
			final War3MapWpm p = w3x.readPathing();
			System.out.println("      wpm size=" + Arrays.toString(p.getSize()));
		});
		step("readUnits (war3mapUnits.doo)", () -> {
			final War3MapUnitsDoo u = w3x.readUnits(w3i[0]);
			System.out.println("      preplaced units=" + u.getUnits().size());
		});
		step("readDoodads (war3map.doo)", () -> w3x.readDoodads(w3i[0]));
		step("readRegions (w3r)", () -> w3x.readRegions());
		step("readModifications (object data merged over the GAME's SLK tables)", () -> w3x.readModifications());

		System.out.println();
		System.out.println(failures == 0 ? "all steps passed" : failures + " step(s) failed");
	}
}
