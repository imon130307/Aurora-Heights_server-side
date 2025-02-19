const express = require('express');
const app = express();
const cors = require('cors');
const cookieParser = require('cookie-parser')
const jwt = require('jsonwebtoken');
require('dotenv').config()
const port = process.env.PORT || 5000;
const stripe=require('stripe')(process.env.PAYMENT_SECRET_KEY)
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');


//!----middleware----
//---- Add Your production domains to your cors configuration----
const corsOptions = {
    origin: [
            'http://localhost:5173',
            'http://localhost:5174',
            'http://localhost:5175',
            'https://dragon-news-77444.web.app',
        ],
    credentials: true,
    optionalSuccessStatus: 200,
}
app.use(cors(corsOptions));
app.use(express.json());
app.use(cookieParser())

// =======MongoDB connection start=======
// console.log(process.env.DB_USER)
// console.log(process.env.DB_PASS)
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.vezpc.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

// ----Create a MongoClient with a MongoClientOptions object to set the Stable API version----
    const client = new MongoClient(uri, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    }
    });

    async function run() {
    try {

        //!---- Connect the client to the server	(optional starting in v4.7)---
        // await client.connect();

        //! ======DB declaration Starts======
        const db = client.db('hostelDB')
        const usersCollection = db.collection('users')
        const mealsCollection = db.collection('meals')
        const upcomingMealsCollection = db.collection('upcoming-meals')
        const requestedMealsCollection = db.collection('requestedMeals')
        //--------------------------------------------
        const reviewsCollection = db.collection('reviews')
        const subscriptionsCollection = db.collection('subscriptions')
        const paymentsCollection = db.collection('payments')
        // =======DB declaration Ends=======

    //!-----Generate jwt token-------
    // ----Let's create a cookie options for both production and local server for vercel-----
    const cookieOptions = {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: process.env.NODE_ENV === "production" ? "none" : "strict",
    };
    //localhost:5000 and localhost:5173 are treated as same site.  so sameSite value must be strict in development server.  in production sameSite will be none
    // in development server secure will false .  in production secure will be true
    //----------creating Token-----------
    app.post('/jwt', async (req, res) => {
        const userInfo = req.body
        const token = jwt.sign(userInfo, process.env.ACCESS_TOKEN_SECRET, { expiresIn: '365d'})
        res
            .cookie('accessToken', token, cookieOptions)
            .send({ success: true })
        })
    //!------ Logout---------
    //-----clearing Token-----
        app.get('/logout', async (req, res) => {
        try {
            res
            .clearCookie('accessToken', { ...cookieOptions, maxAge: 0 })
            .send({ success: true })
        } catch (err) {
            res.status(500).send(err)
        }
        })
    //! ------end jwt related API------

    // !------Create middleware for  verifytoken-----
        const verifyToken = async (req, res, next) => {
            const token = req.cookies?.accessToken
            console.log("I am token==>>>",token)
            if (!token) {
            return res.status(401).send({ message: 'Forbidden access.You have no Token' })
            }
            jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
            if (err) {
                console.log("Token is not verified successfully==>>>",err)
                return res.status(401).send({ message: 'Unauthorized access.Your token is not able to be verified' })
            }
            console.log("I am decoded==>>>",decoded)
            req.userInfo = decoded //---decoded means token in which user's email is contained---
            next()
            })
        }

    // !====use verify admin after verifyToken====
        const verifyAdmin = async (req, res, next) => {
            const email = req.userInfo?.email;
            const query = { email: email };
            const user = await usersCollection.findOne(query);
            console.log("I am user==>>>",user)
            const isAdmin = user?.role === 'admin';
            if (!isAdmin) {
                return res.status(403).send({ message: 'Forbidden Access! Admin Only is allowed for this Actions!' });
            }
            next();
        }
    //!------verify seller middleware------
        const verifyCustomer = async (req, res, next) => {
            // console.log('data from verifyToken middleware--->', req.user?.email)
            const email = req.userInfo?.email
            console.log("I am email==>>>",email);
            const query = { email }
            const user = await usersCollection.findOne(query);
            console.log("I am user==>>>",user)
            const isCustomer = user?.role === 'customer';
            if (!isCustomer)
                return res
                .status(403)
                .send({ message: 'Forbidden Access! Seller Only is allowed for this Actions!' })
            req.customerEmail=email
            next()
        }

         // ====CRUD operation's API Starts======
        //! ------Meals related API------
        app.get('/all-meals', async(req, res) =>{
            const result = await mealsCollection.find().toArray();
            res.send(result);
        })
        // ----get a specific meal-----
        app.get('/meal/:id',verifyToken, async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) }
            const result = await mealsCollection.findOne(query);
            res.send(result);
        })
        // ----get addedMeals(which is added by this admin) for a specific admin -----
        app.get('/added-meals',verifyToken, async (req, res) => {
            const email = req.query.email;
            const query = { seller_email: email };
            const result = await mealsCollection.find(query).toArray();
            res.send(result);
        });

        // ===save a meal data in db===
        app.post('/add-meal',verifyToken,verifyAdmin, async (req, res) => {
            const meal = req.body
            const result = await mealsCollection.insertOne(meal)
            res.send(result)
        })
        // ===save a publish meal data in db===
        app.post('/add-publish-meal',verifyToken,verifyAdmin, async (req, res) => {
            const meal = req.body
            const result = await mealsCollection.insertOne(meal)
            res.send(result)
        })
        // ----increase the number of "like" of a meal----
        app.patch('/meal-like/:id',verifyToken,verifyCustomer, async (req, res) => {
            const id = req.params.id
            const filter = { _id: new ObjectId(id) }
            let updateDoc = {
            $inc: { like: 1 },
            }
            const result = await mealsCollection.updateOne(filter, updateDoc)
            res.send(result)
        })
        // ----delete a admin meal-----
        app.delete('/delete-admin-meal/:id',verifyToken,verifyAdmin, async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) }
            const result = await mealsCollection.deleteOne(query);
            res.send(result);
        })
        


        // !------Requested Meals related API------
        app.post('/post-requested-meal',verifyToken,verifyCustomer,async(req,res)=>{
            const meal=req.body;
            const result=await requestedMealsCollection.insertOne(meal);
            res.send(result)
        })

        app.get('/requested-meal',verifyToken, async (req, res) => {
            const email = req.query.email;
            const query = { email: email };
            const result = await requestedMealsCollection.find(query).toArray();
            res.send(result);
        });

        app.delete('/delete-meal/:id',verifyToken, async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) }
            const result = await requestedMealsCollection.deleteOne(query);
            res.send(result);
        })

        // -----delivered requested meal status------
        app.patch('/delivered-meal/:id',verifyToken, async (req, res) => {
            const id = req.params.id
            const filter = { _id: new ObjectId(id) }
            const updatedDoc = {
                $set: {
                    status: "delivered",
                }
            }
            const result = await requestedMealsCollection.updateOne(filter, updatedDoc)
            res.send(result)
        })


        // !------Users related API---------

        app.post('/user/:email', async (req, res) => {
            const user = req.body;
            // *----start existing check------
            //-----insert email if user doesnt exists: -----
            //----- you can do this many ways (1. email unique, 2. upsert 3. simple checking)----
            const query = { email: user.email }
            const existingUser = await usersCollection.findOne(query);
            if (existingUser) {
                return res.send({ message: 'user already exists', insertedId: null })
            }
            // *----end existing check------
            const result = await usersCollection.insertOne(user);
            res.send(result);
        });

        // *----OR------
        // app.post('/user/:email', async (req, res) => {
        //     // sendEmail();
        //     const email = req.params.email
        //     const query = { email }
        //     const user = req.body
        //     // ===check if user exists in db===
        //     const isExist = await usersCollection.findOne(query)
        //     if (isExist) {
        //         return res.send(isExist)
        //     }
        //     const result = await usersCollection.insertOne({
        //         ...user,
        //         role: 'customer',
        //         timestamp: Date.now(),
        //     })
        //     res.send(result)
        // })

      //-----get user role------
        app.get('/user-role/role/:email',verifyToken, async (req, res) => {
            const email = req.params.email
            const query={email}
            const result = await usersCollection.findOne(query)
            res.send({ role: result?.role })
        })

        //-----get user badge------
        app.get('/user-badge/badge/:email',verifyToken, async (req, res) => {
            const email = req.params.email
            const query={email}
            const result = await usersCollection.findOne(query)
            res.send({ badge: result?.badge })
        })

        // ----change user badge-----
        app.patch('/badge-change/:email',verifyToken, async (req, res) => {
            const email = req.params.email;
            const item = req.body;
            const filter = { email: email };
            const updatedDoc = {
                $set: {
                    badge: item.badge,
                }
            }
            const result = await usersCollection.updateOne(filter, updatedDoc);
            res.send(result);
        })

        //*-------make admin---------
        app.patch('/user-into/admin/:id',verifyToken,verifyAdmin, async (req, res) => {
            const id = req.params.id;
            const filter = { _id: new ObjectId(id) };
            const updatedDoc = {
                $set: {
                    role: 'admin'
                }
            }
            const result = await usersCollection.updateOne(filter, updatedDoc);
            res.send(result);
        })




        //! ------Reviews related API--------
        app.get('/all-reviews', async(req, res) =>{
            const result = await reviewsCollection.find().toArray();
            res.send(result);
        })

        app.get('/admin-reviews/:email',verifyToken, async (req, res) => {
            const email = req.params.email;
            const query = { seller_email: email };
            const result = await reviewsCollection.find(query).toArray();
            res.send(result);
        });

        app.delete('/admin-review-delete/:id',verifyToken, async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) }
            const result = await reviewsCollection.deleteOne(query);
            res.send(result);
        })

        app.get('/review-details/:id',verifyToken, async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) }
            const result = await reviewsCollection.findOne(query);
            res.send(result);
        })



        //! ------Admin related API--------
        app.get('/manage-users',verifyToken, async (req, res) => {
            const result = await usersCollection.find().toArray();
            res.send(result);
        });

        app.get('/admin-all-meals/:email',verifyToken, async (req, res) => {
            const email = req.params.email;
            const query = { seller_email: email };
            const result = await mealsCollection.find(query).toArray();
            res.send(result);
        });

        app.get('/admin-requested-meals/:email',verifyToken, async (req, res) => {
            const email = req.params.email;
            const query = { 'sellerInfo.email' : email };
            const result = await requestedMealsCollection.find(query).toArray();
            res.send(result);
        });




        //!-----Upcoming Meal related API--------
        app.get('/upcoming-meals',verifyToken, async(req, res) =>{
            const result = await upcomingMealsCollection.find().toArray();
            res.send(result);
        })

        app.get('/admin-upcoming-meals/:email',verifyToken, async (req, res) => {
            const email = req.params.email;
            const query = { seller_email: email };
            const result = await upcomingMealsCollection.find(query).toArray();
            res.send(result);
        });

        app.delete('/delete-publish-meal/:id',verifyToken, async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) }
            const result = await upcomingMealsCollection.deleteOne(query);
            res.send(result);
        })


        //! ------Customer related API--------
        // app.get('/my-requested-meals/:email', async (req, res) => {
        //     const email = req.params.email;
        //     const query = { 'customerInfo.email' : email };
        //     const result = await requestedMealsCollection.find(query).toArray();
        //     res.send(result);
        // });
        app.get('/my-requested-meals/:email',verifyToken, async (req, res) => {
            const email = req.params.email;
            const query = { 'customerInfo.email' : email };
            const result = await requestedMealsCollection
            .aggregate([
                {
                    $match: query, //Match specific customers data only by email
                },
                {
                    $addFields: {
                        requestedMealObjectId: { 
                            $toObjectId: '$requestedMealId' //convert plantId string field to objectId field
                        }, 
                    },
                },
                {
                    $lookup: {
                      //!---- go to a different collection and look for data-----
                      from: 'meals', // --collection name--
                      localField: 'requestedMealObjectId', //-- local data that you want to match--
                      foreignField: '_id', //-- foreign field name of that same data--
                      as: 'mealsCollection', // --return the data as mealsCollection array of object (array naming)--
                    },
                },
                { 
                    $unwind: '$mealsCollection' // --unwind lookup result, return without array e.g Object--
                },
                {
                    $addFields: 
                    {
                      // ---add these fields in order object---
                        like: '$mealsCollection.like',
                        reviews_count: '$mealsCollection.reviews_count',
                    },
                },
                {
                    //---remove mealsCollection object property from order object---
                    $project: {
                        mealsCollection: 0,
                    },
                },
            ])
            .toArray();
            res.send(result);
        });



        //! ------Payment related API--------
        // ---Create payment Intent for client_secret-----
        app.post('/create-payment-intent',verifyToken,async(req,res)=>{
            const {subscriptionsFee}=req.body;
            console.log("Amount inside Payment Intent===>>>",subscriptionsFee)
            if (!subscriptionsFee) {
                        return res.status(400).send({ message: 'subscriptionsFee Not Found' })
                    }
            const totalFee=parseInt(subscriptionsFee*100);
            // --create a payment intent with the subscriptions amount and currency---
            const paymentIntent=await stripe.paymentIntents.create({
                amount:totalFee,
                currency:'usd',
                automatic_payment_methods: {
                    enabled: true,
                },
            });
            // ---send client_secret to clientSide from serverSide as response-----
            res.send({
                        clientSecret: paymentIntent?.client_secret,
                    })
        })

        // -----Save subscriptionsInfo  in DB-----
        app.post('/subscriptions-info',verifyToken, async (req, res) => {
            const subscriptionsInfo = req.body;
            const subscriptionsInfoResult = await subscriptionsCollection.insertOne(subscriptionsInfo);
            res.send({ subscriptionsInfoResult});
            })
        // -----get subscriptionsInfo  from DB-----
        app.get('/subscriptions-history/:email',verifyToken, async (req, res) => {
            const email=req.params.email;
            const query = { email: email }
            console.log(req.userInfo)
            if ( email !== req.userInfo?.email) {
                return res.status(403).send({ message: 'Forbidden access' });
            }
            const result = await subscriptionsCollection.find(query).toArray();
            res.send(result);
        })



     // ====CRUD operation's API End=========
    //!---- Send a ping to confirm a successful connection----
        // await client.db("admin").command({ ping: 1 });
        // console.log("Hello,I am from MongoDB. You successfully connected to Me!");
    } finally {
        // ----Ensures that the client will close when you finish/error---
        // await client.close();
    }
    }
    run().catch(console.dir);
// !=======MongoDB connection end=========

app.get('/', (req, res) => {
    res.send('Hostel is from MongoDB representing at Browser')
})

app.listen(port, () => {
    console.log(`Hostel is running on port ${port} at Browser`);
})


/**
 * --------------------------------
 *      NAMING CONVENTION
 * --------------------------------
 * app.get('/users')
 * app.get('/users/:id')
 * app.post('/users')
 * app.put('/users/:id')
 * app.patch('/users/:id')
 * app.delete('/users/:id')
 * 
*/