const { createFullServer } = require('./app.cjs');

const app = createFullServer();
const PORT = process.env.PORT || 3001;

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Lexnote server running on http://0.0.0.0:${PORT}`);
});
