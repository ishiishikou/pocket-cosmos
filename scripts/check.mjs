import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const files=execFileSync('git',['ls-files','--cached','--others','--exclude-standard','-z'],{encoding:'utf8'}).split('\0').filter(Boolean);
let failed=false;
const patterns=[
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
  /(?:gh[pousr]_|github_pat_)[A-Za-z0-9_]{30,}/,
  /(?:sk_live_|sb_secret_)[A-Za-z0-9_-]{16,}/,
  /AKIA[A-Z0-9]{16}/,
  /https?:\/\/[^\s/@:]+:[^\s/@]+@/,
  /(?:supabase\.co|api\.openai\.com)\/[^\s]*[?&](?:key|token)=/,
];
for(const path of files){
  if(/(?:^|\/)(?:\.env(?:\.|$)|auth\.json|credentials|source-private|private-name-check)/.test(path) && path!=='.env.example'){console.error(`Forbidden file: ${path}`);failed=true;}
  if(!/\.(?:js|mjs|json|md|html|css|ya?ml|svg)$/.test(path))continue;
  const content=readFileSync(path,'utf8');
  for(const pattern of patterns)if(pattern.test(content)){console.error(`Potential secret in ${path}`);failed=true;}
  if(/\.(?:js|mjs)$/.test(path))try{execFileSync(process.execPath,['--check',path],{stdio:'pipe'});}catch(e){console.error(e.stderr.toString());failed=true;}
}
if(failed)process.exit(1);
console.log(`Syntax and secret checks passed (${files.length} files).`);
