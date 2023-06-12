const express = require('express');
const cors = require('cors');
const app = express();
require('dotenv').config()
const port = process.env.PORT || 5000;

// middleware
app.use(cors());
app.use(express.json());



app.get('/', (req, res) => {
    res.send('Olympia Camp is running')
})

app.listen(port, () => {
    console.log(`Olympia camp in running on ${port}`);
})