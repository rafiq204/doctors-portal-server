const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
require('dotenv').config();
const app = express();
const { MongoClient, ServerApiVersion } = require('mongodb');
const port =process.env.PORT || 5000

app.use(cors());
app.use(express.json())


const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.tzelbqz.mongodb.net/?retryWrites=true&w=majority`;
const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true, serverApi: ServerApiVersion.v1 });

function verifyJWT(req , res , next){
 const authHeader = req.headers.authorization ; 
 if(!authHeader){
  return res.status(401).send({message: 'UnAuthorized access'})
 }
 const token = authHeader.split(' ')[1];
 jwt.verify(token, process.env.ACCESS_SECRET_TOKEN, function(err, decoded) {
  if(err){
    return res.status(403).send({message:'Forbidden access'})
  }
   req.decoded = decoded;
   next();
});
}


async function run (){
    try{
        await client.connect();
        const serviceCollection = client.db("doctors_portal").collection("services");
        const bookingCollection = client.db("doctors_portal").collection("bookings");
        const userCollection = client.db("doctors_portal").collection("users");
        const doctorCollection = client.db("doctors_portal").collection("doctors");
        
        const verifyAdmin = async(req , res , next)=>{
          const requester = req.decoded.email;
          const requesterAccount = await userCollection.findOne({email:requester})
          if(requesterAccount.role === 'admin'){
            next();
          }
          else{
            res.status(403).send({message:'forbidden'})
          }
        }

        app.get('/service' , async(req , res)=>{
            const query ={};
            const cursor = serviceCollection.find(query).project({name: 1});
            const service = await cursor.toArray();
            res.send(service)
        });
        
        app.get('/user',verifyJWT, async (req , res)=>{
           const users = await userCollection.find().toArray();
           res.send(users)
        });

        app.get('/admin/:email' , async(req , res)=>{
          const email = req.params.email;
          const user = await userCollection.findOne({email:email});
          const isAdmin = user.role === 'admin';
          res.send ({admin:isAdmin})
        })

        app.put('/user/admin/:email',verifyJWT,verifyAdmin ,async (req , res) =>{
          const email = req.params.email;
            const filter = {email: email };
            const updateDoc = {
              $set: {role:'admin'},
            };
            const result = await userCollection.updateOne(filter, updateDoc);
              res.send(result);
        });

        app.put('/user/:email' ,async (req , res) =>{
          const email = req.params.email;
          const user = req.body;
          const filter = {email: email };
          const options = { upsert: true };
          const updateDoc = {
            $set: user,
          };
          const result = await userCollection.updateOne(filter, updateDoc, options);
          const token = jwt.sign({email:email},process.env.ACCESS_SECRET_TOKEN ,{ expiresIn: '1h' })
            res.send({result,token});
        });


        app.get('/available' , async(req,res) =>{
          const date = req.query.date ; 
          const services= await serviceCollection.find().toArray();
          const query = {date: date};
          const bookings= await bookingCollection.find(query).toArray();
          services.forEach(service =>{
            const serviceBookings = bookings.filter(book =>book.treatment === service.name);
            const bookedSlots = serviceBookings.map(book =>book.slot);
            const available = service.slots.filter( slot => !bookedSlots.includes(slot));
            service.slots = available; 
            
          })
          res.send(services)

        })

        /**
         * ApI naming Convention 
         * app.get('/booking')// getting all bookings in this collection or more than one or by filter
         * app.get('/booking/:id') // get a specific booking
         * app.post('/booking') // add a new booking
         * app.patch('/booking/:id') // update 
         * app.put (upsert > update (if exist) , insert (if does not exist))
         * app.delete('/booking/:id') // delete
         */
        app.get('/booking',verifyJWT, async(req , res) =>{
           const patientEmail=req.query.patientEmail;
           const query = {patientEmail: patientEmail};
           const decodedEmail = req.decoded.email;
           if(patientEmail ===decodedEmail){
            const bookings = await bookingCollection.find(query).toArray();
            return res.send(bookings)
           }
           else{
             return res.status(403).send({message:'Forbidden access'})
           }
        });

        app.post('/booking',async(req,res)=>{
          const booking = req.body;
          const query = {treatment:booking.treatment, date:booking.date , patientName:booking.patientName}
          const exist= await bookingCollection.findOne(query);
          if(exist){
            return res.send({success:false , booking:exist})
          }
          const result = await bookingCollection.insertOne(booking);
          return res.send({success:true, result})
        });

        app.get('/doctor' ,verifyJWT,verifyAdmin, async(req , res)=>{
          const doctors = await doctorCollection.find().toArray();
          res.send(doctors)
        });


        app.post('/doctor' ,verifyJWT,verifyAdmin, async (req , res)=>{
          const doctor = req.body;
          const result = await doctorCollection.insertOne(doctor);
          res.send(result)
        });

        app.delete('/doctor/:email' , verifyJWT , verifyAdmin ,async (req , res )=>{
          const email = req.params.email;
          const filter = ({email:email});
          const result = await doctorCollection.deleteOne(filter)
          res.send(result)
        })

    }
    finally{

    }
}
run().catch(console.dir);

app.get('/', (req, res) => {
  res.send('Hello Doctors portal ')
})

app.listen(port, () => {
  console.log(`Doctors portal app listening on port ${port}`)
})