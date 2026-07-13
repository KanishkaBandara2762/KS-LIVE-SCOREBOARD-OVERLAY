const fs = require('fs');

const inputCss = fs.readFileSync('IPL 2026/style.css', 'utf8');

let outputCss = inputCss.replace(/\*\{[\s\S]*?\}/, '');
outputCss = outputCss.replace(/body\{[\s\S]*?\}/, '');

const animationsCss = "\n" +
"/* ===========================\n" +
"   ADDED ENTRANCE ANIMATIONS\n" +
"=========================== */\n" +
"\n" +
".anim-ipl2026-entrance {\n" +
"    animation: slideUpFade 0.8s cubic-bezier(0.16, 1, 0.3, 1) forwards;\n" +
"    transform: translateX(-50%) translateY(100px);\n" +
"    opacity: 0;\n" +
"}\n" +
"@keyframes slideUpFade {\n" +
"    to {\n" +
"        transform: translateX(-50%) translateY(0);\n" +
"        opacity: 1;\n" +
"    }\n" +
"}\n" +
"\n" +
".anim-ipl2026-panel-left {\n" +
"    animation: slideRight 0.6s cubic-bezier(0.16, 1, 0.3, 1) 0.3s forwards;\n" +
"    transform: translateX(-50px);\n" +
"    opacity: 0;\n" +
"}\n" +
"@keyframes slideRight {\n" +
"    to { transform: translateX(0); opacity: 1; }\n" +
"}\n" +
"\n" +
".anim-ipl2026-panel-right {\n" +
"    animation: slideLeft 0.6s cubic-bezier(0.16, 1, 0.3, 1) 0.3s forwards;\n" +
"    transform: translateX(50px);\n" +
"    opacity: 0;\n" +
"}\n" +
"@keyframes slideLeft {\n" +
"    to { transform: translateX(0); opacity: 1; }\n" +
"}\n" +
"\n" +
".anim-ipl2026-pop {\n" +
"    animation: popIn 0.6s cubic-bezier(0.175, 0.885, 0.32, 1.275) 0.6s forwards, glow 2s infinite 1.2s;\n" +
"    transform: translateX(-50%) scale(0);\n" +
"    opacity: 0;\n" +
"}\n" +
"@keyframes popIn {\n" +
"    to { transform: translateX(-50%) scale(1); opacity: 1; }\n" +
"}\n" +
"\n" +
".anim-ipl2026-drop {\n" +
"    animation: dropDown 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.275) 0.8s forwards;\n" +
"    transform: translateY(-20px);\n" +
"    opacity: 0;\n" +
"}\n" +
"@keyframes dropDown {\n" +
"    to { transform: translateY(0); opacity: 1; }\n" +
"}\n" +
"\n" +
".anim-ipl2026-center {\n" +
"    animation: fadeIn 0.8s ease 0.4s forwards;\n" +
"    opacity: 0;\n" +
"}\n" +
"@keyframes fadeIn {\n" +
"    to { opacity: 1; }\n" +
"}\n";

outputCss += animationsCss;

fs.writeFileSync('frontend/src/components/IPL2026Theme.css', outputCss);
console.log('Successfully written CSS with animations.');
