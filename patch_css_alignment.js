const fs = require('fs');

const path = 'frontend/src/components/IPL2026Theme.css';
let code = fs.readFileSync(path, 'utf8');

code = code.replace(
    /(\.player-name\{[\s\S]*?text-transform:uppercase;)(\s*\})/,
    '$1\n    white-space:nowrap;\n    overflow:hidden;\n    text-overflow:ellipsis;\n    max-width:220px;$2'
);

code = code.replace(
    /(\.player-score\{[\s\S]*?font-weight:800;)(\s*\})/,
    '$1\n    white-space:nowrap;\n    flex-shrink:0;\n    text-align:right;$2'
);

code = code.replace(
    /(\.bowler-name\{[\s\S]*?font-weight:800;)(\s*\})/,
    '$1\n    white-space:nowrap;\n    overflow:hidden;\n    text-overflow:ellipsis;\n    max-width:220px;$2'
);

code = code.replace(
    /(\.bowler-figures\{[\s\S]*?font-weight:700;)(\s*\})/,
    '$1\n    white-space:nowrap;\n    flex-shrink:0;$2'
);

fs.writeFileSync(path, code);
console.log('Successfully patched IPL2026Theme.css spacing constraints.');
