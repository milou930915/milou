// Embed the editable teaching data into the single-file Railway frontend.
const fs=require('node:fs'),path=require('node:path');
const root=path.join(__dirname,'..');
const data=JSON.parse(fs.readFileSync(path.join(root,'content/learning-v22.json'),'utf8'));
const target=path.join(root,'app/index.html');
let html=fs.readFileSync(target,'utf8');
const bundle='// LEARNING_CONTENT_START\nconst LEARNING_CONTENT='+JSON.stringify(data).replace(/</g,'\\u003c')+';\n// LEARNING_CONTENT_END';
if(html.includes('// LEARNING_CONTENT_START'))html=html.replace(/\/\/ LEARNING_CONTENT_START[\s\S]*?\/\/ LEARNING_CONTENT_END/,()=>bundle);
else html=html.replace('function glossaryMatches(text)',bundle+'\nfunction glossaryMatches(text)');
fs.writeFileSync(target,html);
