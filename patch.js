const fs = require('fs');
let code = fs.readFileSync('src/components/admin/ImageUploadField.tsx', 'utf8');

// Add lastImportedUrl state
code = code.replace(
  'const [localImportError, setLocalImportError] = useState<string | null>(null);',
  'const [localImportError, setLocalImportError] = useState<string | null>(null);\n  const [lastImportedUrl, setLastImportedUrl] = useState<string | null>(null);'
);

// Update useEffect for auto import
code = code.replace(
  /useEffect\(\(\) => \{\n    if \(isRemoteUrl && !isStoredUrl && !importingRemote && !justImported && !localImportError\) \{\n      handleImportRemoteUrl\(cleanVal\);\n    \}\n  \}, \[cleanVal, isRemoteUrl, isStoredUrl, importingRemote, justImported, localImportError, handleImportRemoteUrl\]\);/g,
  `useEffect(() => {
    if (isRemoteUrl && !isStoredUrl && cleanVal !== lastImportedUrl && !importingRemote && !justImported && !localImportError) {
      const timer = setTimeout(() => {
        setLastImportedUrl(cleanVal);
        handleImportRemoteUrl(cleanVal);
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [cleanVal, isRemoteUrl, isStoredUrl, importingRemote, justImported, localImportError, lastImportedUrl, handleImportRemoteUrl]);`
);

// clear lastImportedUrl when user changes input
code = code.replace(
  'onChange={(e) => {',
  'onChange={(e) => {\n                    setLastImportedUrl(null);'
);

// Also we should allow re-import on error. The user says if failed, keep sourceUrl + show retry button.
// And no large placeholder.

fs.writeFileSync('src/components/admin/ImageUploadField.tsx', code);
