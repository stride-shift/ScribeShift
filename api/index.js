let app;
try {
  app = (await import('../server/index.js')).default;
} catch (err) {
  // If server fails to load, return the actual error as JSON
  app = (req, res) => {
    res.status(500).json({
      error: 'Server failed to start',
      message: err.message,
      stack: err.stack?.split('\n').slice(0, 5),
    });
  };
}

export default app;
