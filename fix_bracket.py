import re
with open('packages/database/src/repository.ts', 'r', encoding='utf-8') as f:
    content = f.read()
content = re.sub(r'  }\n}\n  updateWorkerProfile', '  }\n  updateWorkerProfile', content)
if not content.strip().endswith('}'):
    content += '\n}\n'
with open('packages/database/src/repository.ts', 'w', encoding='utf-8') as f:
    f.write(content)
