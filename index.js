// server.js
const express = require('express');
const cors = require('cors');
const app = express();
const PORT = process.env.PORT || 5000;






// Middleware
app.use(cors());
app.use(express.json());

app.get('/',(req,  res) =>{
    res.send("Data is being fatced from the server")
})



// Start Server
app.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
});
