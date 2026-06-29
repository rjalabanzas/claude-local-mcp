@echo off
rem Windows launcher for the ms365 auth-cache wrapper. Node spawns the
rem MS365_MCP_AUTH_CACHE_COMMAND with shell:false, so a bare .py/extension-less
rem script isn't directly executable on Windows — this .cmd runs it via python.
rem Requires Python 3 on PATH at server runtime.
python "%~dp0ms365-auth-cache" %*
