@echo off
echo Starting Official Supabase MCP Server...
cd supabase-mcp-server-official
rem Previous attempt: npm start
node ./packages/mcp-server-supabase/dist/stdio.js
echo Server process exited.
pause 