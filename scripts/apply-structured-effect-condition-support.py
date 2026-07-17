from pathlib import Path
import subprocess

path = "scripts/apply-structured-effect-condition-support.py"
source = subprocess.check_output(["git", "show", f"HEAD^:{path}"], text=True)
source = source.replace(
    'if core.count("getEffectConditionContext(entry)") != 6:',
    'if core.count("getEffectConditionContext(entry)") != 5:',
)
source = source.replace(
    'if core.count("isConditionMet(") != 7:',
    'if core.count("isConditionMet(") != 6:',
)
namespace = {"__name__": "__main__", "__file__": str(Path(path).resolve())}
exec(compile(source, path, "exec"), namespace)
