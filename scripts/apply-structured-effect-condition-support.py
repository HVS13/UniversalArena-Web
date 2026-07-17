from pathlib import Path
import subprocess

path = "scripts/apply-structured-effect-condition-support.py"
source = subprocess.check_output(
    [
        "git",
        "show",
        "0a5046d8e089baf5a3e5fa873e17680e612866e0:" + path,
    ],
    text=True,
)
context_old = 'if core.count("getEffectConditionContext(entry)") != ' + '6:'
context_new = 'if core.count("getEffectConditionContext(entry)") != ' + '5:'
condition_old = 'if core.count("isConditionMet(") != ' + '7:'
condition_new = 'if core.count("isConditionMet(") != ' + '6:'
source = source.replace(context_old, context_new)
source = source.replace(condition_old, condition_new)
namespace = {"__name__": "__main__", "__file__": str(Path(path).resolve())}
exec(compile(source, path, "exec"), namespace)
