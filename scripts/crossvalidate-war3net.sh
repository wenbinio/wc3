#!/usr/bin/env bash
# OPTIONAL third-opinion cross-validation with War3Net (C#/.NET, MIT).
# See docs/PIPELINE.md §6. This is documentation-as-a-script: dotnet is NOT a
# dependency of this toolkit and nothing else here needs it. The script
# refuses to install anything on its own; it tells you what to install and,
# when dotnet is already present, scaffolds and runs the checker.
#
# Usage:
#   bash scripts/crossvalidate-war3net.sh <extracted-map-dir>
# where <extracted-map-dir> is the output of tools/w3x-extract.js
# (raw war3map.* files). Parses war3map.w3i and war3map.w3e with
# War3Net.Build.Core and reports pass/fail per file. War3Net handles both
# classic AND Reforged format versions, so it is the tie-breaker when
# wc3maptranslator and mdx-m3-viewer-th disagree (e.g. the 1.32 w3c camera
# layout — see docs/FORMATS.md).
set -euo pipefail

EXTRACTED="${1:-}"
if [ -z "$EXTRACTED" ] || [ ! -d "$EXTRACTED" ]; then
    echo "usage: bash scripts/crossvalidate-war3net.sh <extracted-map-dir>" >&2
    echo "  (produce the dir with: node tools/w3x-extract.js <map.w3x> <dir>)" >&2
    exit 2
fi

if ! command -v dotnet >/dev/null 2>&1; then
    cat >&2 <<'EOF'
dotnet not found. War3Net cross-validation is OPTIONAL — install the SDK only
if you actually need a third opinion:

    sudo apt-get install -y dotnet-sdk-8.0

then re-run this script. Nothing else in this toolkit needs dotnet.
EOF
    exit 3
fi

WORK="$(mktemp -d /tmp/war3net-check.XXXXXX)"
trap 'rm -rf "$WORK"' EXIT

# Minimal checker project (the "check program pattern" from docs/PIPELINE.md):
# one console app + a War3Net.Build.Core reference; Parse() throws on any
# malformed/unknown-version file, so parse success IS the check.
mkdir -p "$WORK/check"
cat > "$WORK/check/check.csproj" <<'EOF'
<Project Sdk="Microsoft.NET.Sdk">
  <PropertyGroup>
    <OutputType>Exe</OutputType>
    <TargetFramework>net8.0</TargetFramework>
    <Nullable>enable</Nullable>
  </PropertyGroup>
  <ItemGroup>
    <PackageReference Include="War3Net.Build.Core" Version="5.*" />
  </ItemGroup>
</Project>
EOF
cat > "$WORK/check/Program.cs" <<'EOF'
using War3Net.Build.Environment;
using War3Net.Build.Info;

var dir = args[0];
var failures = 0;

void Check(string name, Action<string> parse)
{
    var path = Path.Combine(dir, name);
    if (!File.Exists(path)) { Console.WriteLine($"SKIP  {name} (absent)"); return; }
    try { parse(path); Console.WriteLine($"PASS  {name} (War3Net parse OK)"); }
    catch (Exception e) { Console.WriteLine($"FAIL  {name} ({e.Message})"); failures++; }
}

Check("war3map.w3i", p => { using var s = File.OpenRead(p); using var r = new BinaryReader(s); _ = MapInfo.Parse(s); });
Check("war3map.w3e", p => { using var s = File.OpenRead(p); _ = MapEnvironment.Parse(s); });

return failures == 0 ? 0 : 1;
EOF

echo "building War3Net checker (first run downloads NuGet packages)..."
dotnet build "$WORK/check" -v q --nologo >/dev/null
dotnet run --project "$WORK/check" --no-build -- "$(cd "$EXTRACTED" && pwd)"
