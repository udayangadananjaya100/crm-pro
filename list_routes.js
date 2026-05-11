const app = require('./src/index');
const listEndpoints = (app) => {
  const stack = app._router.stack;
  const routes = [];
  
  const printStack = (path, stack) => {
    stack.forEach(layer => {
      if (layer.route) {
        const methods = Object.keys(layer.route.methods).join(',').toUpperCase();
        routes.push(`${methods} ${path}${layer.route.path}`);
      } else if (layer.name === 'router') {
        const newPath = path + layer.regexp.source.replace('^\\', '').replace('\\/?(?=\\/|$)', '').replace('\\/', '/');
        printStack(newPath, layer.handle.stack);
      }
    });
  };
  
  printStack('', stack);
  return routes;
};

console.log('--- ALL REGISTERED ROUTES ---');
const endpoints = listEndpoints(app);
endpoints.forEach(e => console.log(e));
console.log('--- END ---');
process.exit(0);
