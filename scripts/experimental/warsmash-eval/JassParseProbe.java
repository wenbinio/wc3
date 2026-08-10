// JassParseProbe — does Warsmash's JASS front end accept a real map's script?
//
// Usage:
//   java -cp "probe:$(cat $WORK/classpath.txt)" JassParseProbe common.j Blizzard.j war3map.j
//
// common.j / Blizzard.j are Blizzard-authored and are USER-SUPPLIED from an
// owned install (same rule as WC3_COMMONJ for the pjass gate). Never commit them.
//
// This answers the question a native-name diff cannot: does the ANTLR/byacc
// grammar parse the script, and does instruction building resolve EVERY
// function the script references? An unresolved reference throws
// "Unable to find function: X" out of InstructionAppendingJassStatementVisitor
// — that is the hard failure mode. A native that is DECLARED but has no Java
// implementation is a SOFT failure: it prints to stderr and returns the null
// value of its return type (NativeJassFunction.checkNativeExists).
//
// Measured 2026-08-10, Fall of Rome 1.06 (553 KB war3map.j) and the rome-ai
// build (615 KB): both parse in ~100 ms and initialize() resolves everything.
import java.io.FileReader;

import com.etheller.interpreter.ast.util.JassProgram;

import net.warsmash.parsers.jass.SmashJassParser;

public class JassParseProbe {
	public static void main(final String[] args) throws Exception {
		if (args.length < 1) {
			System.err.println("usage: JassParseProbe <file.j> [<file.j> ...]   (common.j first, map script last)");
			System.exit(2);
		}
		final JassProgram program = new JassProgram();
		for (final String file : args) {
			final long t0 = System.currentTimeMillis();
			try (FileReader reader = new FileReader(file)) {
				new SmashJassParser(reader).scanAndParse(file, program);
			}
			System.err.println("PARSED " + file + " in " + (System.currentTimeMillis() - t0) + " ms");
		}
		final long t0 = System.currentTimeMillis();
		program.initialize();
		System.err.println("initialize() (instruction build; resolves every function reference) in "
				+ (System.currentTimeMillis() - t0) + " ms");
		System.err.println("main present:   " + (program.globalScope.getUserFunctionInstructionPtr("main") != null));
		System.err.println("config present: " + (program.globalScope.getUserFunctionInstructionPtr("config") != null));
	}
}
