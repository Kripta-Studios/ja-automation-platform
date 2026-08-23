const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

execSync('mkdir -p trace-out');
execSync('tar -xf test-results/portal-responsive-editable-ae6c9--and-preserves-valid-values-phone-360/trace.zip -C trace-out');
const files = fs.readdirSync('trace-out');
console.log(files);
