npm run lint > lint_output.txt
cat lint_output.txt | grep -B 2 -A 5 "error"
