const express = require('express');
const cors = require('cors');
const app = express();
require('dotenv').config()
const jwt = require('jsonwebtoken');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const stripe = require('stripe')(process.env.PAYMENT_SECRET_KEY)
const port = process.env.PORT || 5000;

// middleware
app.use(cors());
app.use(express.json());



// verifyJWT
const verifyJWT = (req, res, next) => {
    const authorization = req.headers.authorization;
    if (!authorization) {
        return res.status(401).send({ error: true, message: 'unauthorized access' });
    }
    // bearer token
    const token = authorization.split(' ')[1];

    jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
        if (err) {
            return res.status(401).send({ error: true, message: 'unauthorized access' })
        }
        req.decoded = decoded;
        next();
    })
}




const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.b1uj4ox.mongodb.net/?retryWrites=true&w=majority`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    }
});

async function run() {
    try {
        // Connect the client to the server	(optional starting in v4.7)
        await client.connect();

        const classesCollection = client.db('olympiaDB').collection('sportsClasses');
        const usersCollection = client.db('olympiaDB').collection('users');
        const selectedClassesCollection = client.db('olympiaDB').collection('selectedClasses');
        const paymentsCollection = client.db('olympiaDB').collection('payments');

        // jwt sign
        app.post('/jwt', (req, res) => {
            const user = req.body;
            const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, { expiresIn: '1h' })
            res.send({ token })
        })

        // verifyAdmin
        const verifyAdmin = async (req, res, next) => {
            const email = req.decoded.email;
            const query = { email: email }
            const user = await usersCollection.findOne(query);
            if (user?.role !== 'admin') {
                return res.status(403).send({ error: true, message: 'forbidden message' });
            }
            next();
        }

        // verifyInstructor
        const verifyInstructor = async (req, res, next) => {
            const email = req.decoded.email;
            const query = { email: email }
            const user = await usersCollection.findOne(query);
            if (user?.role !== 'instructor') {
                return res.status(403).send({ error: true, message: 'forbidden message' });
            }
            next();
        }





        // user related api
        app.post('/users', async (req, res) => {
            const user = req.body;
            const query = { email: user.email }
            const existingUser = await usersCollection.findOne(query);
            if (existingUser) {
                return res.send({ message: 'user already exist' })
            }
            const result = await usersCollection.insertOne(user);
            res.send(result);
        })


        app.get('/users', verifyJWT, verifyAdmin, async (req, res) => {
            const result = await usersCollection.find().toArray();
            res.send(result);
        })






        //  make Admin
        app.patch('/users/admin/:id', async (req, res) => {
            const id = req.params.id

            const filter = { _id: new ObjectId(id) }
            const updateDoc = {
                $set: {
                    role: 'admin'
                }
            }
            const result = await usersCollection.updateOne(filter, updateDoc);
            res.send(result);
        })

        // make Instructor
        app.patch('/users/instructor/:id', async (req, res) => {
            const id = req.params.id

            const filter = { _id: new ObjectId(id) }
            const updateDoc = {
                $set: {
                    role: 'instructor'
                }
            }
            const result = await usersCollection.updateOne(filter, updateDoc);
            res.send(result);
        })


        // check Admin
        app.get('/users/admin/:email', verifyJWT, async (req, res) => {
            const email = req.params.email;

            if (req.decoded.email !== email) {
                res.send({ admin: false })
            }

            const query = { email: email }
            const user = await usersCollection.findOne(query);
            const result = { admin: user?.role === 'admin' }
            res.send(result);
        })

        // check Instructor
        app.get('/users/instructor/:email', verifyJWT, async (req, res) => {
            const email = req.params.email;

            if (req.decoded.email !== email) {
                res.send({ instructor: false })
            }

            const query = { email: email }
            const user = await usersCollection.findOne(query);
            const result = { instructor: user?.role === 'instructor' }
            res.send(result);
        })





        // class related api

        app.post('/classes', async (req, res) => {
            const query = req.body;
            const result = await classesCollection.insertOne(query);
            res.send(result);
        })

        app.get('/classesList', async (req, res) => {
            const result = await classesCollection.find({ status: "approved" }).toArray();
            res.send(result);
        })


        app.get('/classes', async (req, res) => {
            const result = await classesCollection.find().toArray();
            res.send(result);
        })



        // instructor classes
        app.get('/myClasses', verifyJWT, verifyInstructor, async (req, res) => {
            const email = req.query.email;
            if (!email) {
                res.send([]);
                return;
            }

            const decodedEmail = req.decoded.email;
            if (email !== decodedEmail) {
                return res.status(403).send({ error: true, message: 'forbidden access' })
            }

            const query = {
                instructorEmail: email
            };
            const result = await classesCollection.find(query).toArray();
            res.send(result);
        });


        // student select class for enroll---> related api

        app.post('/selectedClasses', async (req, res) => {
            const query = req.body;
            const result = await selectedClassesCollection.insertOne(query);
            res.send(result);
        })

        // get all the selected classes
        app.get('/selectedClasses', verifyJWT, async (req, res) => {
            const email = req.query.email;

            if (!email) {
                res.send([]);
                return;
            }

            const decodedEmail = req.decoded.email;
            if (email !== decodedEmail) {
                return res.status(403).send({ error: true, message: 'forbidden access' })
            }

            const query = { email: email };
            const result = await selectedClassesCollection.find(query).toArray();
            res.send(result);
        });

        // delete selected class
        app.delete('/selectedClasses/:id', async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) };
            const result = await selectedClassesCollection.deleteOne(query);
            res.send(result);
        })


        // payment related api
        app.post("/create-payment-intent", verifyJWT, async (req, res) => {
            const { price } = req.body;
            const amount = price * 100;
            if (!price) return;
            const paymentIntent = await stripe.paymentIntents.create({
                amount: amount,
                currency: "usd",
                payment_method_types: ["card"],
            });

            res.send({
                clientSecret: paymentIntent.client_secret,
            });
        });


        app.post('/payments', verifyJWT, async (req, res) => {
            const payment = req.body;
            const insertResult = await paymentsCollection.insertOne(payment);

            const query = { _id: new ObjectId(payment.id) };

            const deleteResult = await selectedClassesCollection.deleteOne(query)

            res.send({ insertResult, deleteResult });
        })

        

        // admin -->  approve class
        app.patch('/classes/approve/:id', async (req, res) => {
            const id = req.params.id;
            const filter = { _id: new ObjectId(id) };
            const updateDoc = {
                $set: {
                    status: 'approved'
                },
            };

            const result = await classesCollection.updateOne(filter, updateDoc);
            res.send(result);

        })


        // admin --> deny class
        app.patch('/classes/deny/:id', async (req, res) => {
            const id = req.params.id;
            console.log(id);
            const filter = { _id: new ObjectId(id) };
            const updateDoc = {
                $set: {
                    status: 'denied'
                },
            };

            const result = await classesCollection.updateOne(filter, updateDoc);
            res.send(result);

        })


        // admin --> send feedback
        app.patch('/classes/feedback/:id', async (req, res) => {
            const id = req.params.id;
            const { feedback } = req.body;

            try {
                const filter = { _id: new ObjectId(id) };
                const updateDoc = {
                    $set: {
                        feedback: feedback,
                    },
                };

                const result = await classesCollection.updateOne(filter, updateDoc);
                res.send(result);
            } catch (error) {
                console.error(error);
                res.status(500).send("Internal Server Error");
            }
        });


        // Send a ping to confirm a successful connection
        await client.db("admin").command({ ping: 1 });
        console.log("Pinged your deployment. You successfully connected to MongoDB!");
    } finally {
        // Ensures that the client will close when you finish/error
        // await client.close();
    }
}
run().catch(console.dir);



app.get('/', (req, res) => {
    res.send('Olympia Camp is running')
})

app.listen(port, () => {
    console.log(`Olympia camp in running on ${port}`);
})