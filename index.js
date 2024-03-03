/**
 * ==============================
 *  DEVELOPMENT or PRODUCTION MODE
 * ==============================
*/

// process.env.NODE_ENV = 'development'
if (process.env.NODE_ENV !== 'production') {
  require('dotenv').config();
}

/**
 * ==============================
 *  REQUIRE NODE PACKAGES
 * ==============================
*/

const mongoose = require('mongoose');
// const session = require('express-session');
// const flash = require('connect-flash');
// const passport = require('passport');
// const LocalStrategy = require('passport-local');
// const MongoDBStore = require("connect-mongo")//(session); // the (session) syntax is only used for older versions of connect-mongo
const path = require('path'); // If we want this to work from different directories, we are going to require this 'path' module from express.
// const { join } = require('path');
// const bcrypt = require('bcrypt');
const multer = require('multer');
const bodyParser = require('body-parser'); // this will help us pass data in the req.body object to the backend

/**
 * ==============================
 *  CONNECTING TO MONGO SERVER
 * ==============================
*/

const databaseName = 'classEmeanDB';
const connectDB = async () => {
  try {
    const con = await mongoose.connect(
      `mongodb://127.0.0.1:27017/${databaseName}`,
      {
        useNewUrlParser: true,
        useUnifiedTopology: true,
        // useCreateIndex: true
      }
    );
    console.log(`Database connected : ${con.connection.host}`);
  } catch (error) {
    console.error(`Error: ${error.message}`);
    process.exit(1);
  }
};

/**
 * ==============================
 *  GENERAL EXPRESS SETUP
 * ==============================
*/

const express = require('express');
const app = express();
const cors = require('cors');

app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

app.use(cors({ origin: 'http://localhost:4200' }));
// app.use(express.json());

connectDB();

// app.use(()=>{
//     console.log("Test")
// })
// console.dir(app)

const PORT = 3000; // || process.env.PORT

/**
 * ==============================
 *  REQURING MODELS
 * ==============================
*/

const LessonModel = require('./models/lesson-model');
const ExamModel = require('./models/exam-model');
const UserModel = require('./models/user-models');
const SchoolModel = require('./models/school-models');
const LessonTypeModel = require('./models/lesson-type-model');
const questionModel = require('./models/question-model');

/**
 * ==============================
 *  COOKIES, SESSIONS, PASSPORT (AUTHENTICATION and AUTHORISATION) AND FLASH
 * ==============================
*/

const secretKey = 'placeHolderKey'; // || process.env.SECRET; // process.env.SECRET is used for production and 'placeHolderKey' is used for development

// const store =  MongoDBStore.create({ // here, we're using mongo-connect (see our require section) to store our sessions during production
//     mongoUrl:`mongodb://127.0.0.1:27017/${databaseName}`, // note, this DB URL, which will be used for our production mode, is generator by mongo cloud atlas through the 'connect ->connect your application' feature on our cloud.mongodb dashboard.
//     secret: secretKey, // see above for this
//     touchAfter: 24*60*60 // this will make sure the data isn't continuously updated everytime a user refresher the page. We only make updates if something has changed. Here, we're only updating every 24 hours. UNlike session config, this is in seconds, not ms.
// });

// store.on("error",function(e){
//     console.log("STORE ERROR:",e)
// })

// const sessionConfig = {
//     store:store, // this is used in production to make sure our sessions are stored on mongo DB (see above)
//     name: 'mySession', // note, the default cookie name for the user's session ID is connect.sid (or something similar). We don't want to use a generic default, because it makes it easier for hackers to search for that cookie, extract it and log in as the user. For an extra layer of secruity, we've changed the default session cookie name here. Instead of mySession, we can use anything.
//     secret: secretKey, // see above for this
//     resave: false,
//     saveUninitialized: true,
//     cookie:{
//         httpOnly: true,// extra layer of secruity
//         //secure:true, // this will mean that the cookie only works over https (not local host). Because lcoal host is not HTTPS, we don't add this until after development has finished and we're ready to deploy.
//         expires:Date.now() + (1000 * 60 * 60 * 24 * 7), // this is in miliseconds (unlike mongoseDBstore above, which is in seconds)
//         maxAge: 1000 * 60 * 60 * 24 * 7
//     }
// }
// app.use(session(sessionConfig));
// app.use(flash());

// app.use(passport.initialize());
// app.use(passport.session()); // this should always be AFTER app.use(session(sessionConfig))
// passport.use(new LocalStrategy(TeacherModel.authenticate()));

// passport.serializeUser(TeacherModel.serializeUser());
// passport.deserializeUser(TeacherModel.deserializeUser());

// app.use(function(req,res,next){
//     res.locals.currentTeacherModel = req.user;// this will give us access to the current user in all templates, so we can see if someone is loggedin and change our page accordingly.
//     // res.locals.success = req.flash('success')
//     // res.locals.error = req.flash('error')
//     // res.locals.update = req.flash('update')
//     // res.locals.remove = req.flash('remove')
//     next();
// })

/**
 * ==============================
 *  IMPORTING ROUTES
 * ==============================
*/

app.get('/test', (req, res) => {
  res.json({ message: 'Hello from Express!' });
});

const lessonRouter = require('./routes/LessonRoutes');
const userRouter = require('./routes/UserRoutes');
const lessonTypeRouter = require('./routes/LessonTypeRoutes');
const examRouter = require('./routes/ExamRoutes');
const schoolRouter = require('./routes/SchoolRoutes');
const questionRouter = require('./routes/QuestionRoutes');

app.use('/users', userRouter);
app.use('/exams', examRouter);
app.use('/schools', schoolRouter);
app.use('/questions', questionRouter);
app.use('/lessons', lessonRouter);
app.use('/lesson-types', lessonTypeRouter);

/**
 * ==============================
 *  EJS ENGINE SETUP
 * ==============================
*/

// app.engine('ejs', ejsMateEngine)
app.set('src', path.join(__dirname, '../src')); // this, along with the 'require path' code above, will allow us to run code in a director different from where the 'views' folder is saved. It's not 100% necessary becuase we usually always work in the views folder, but it is best practice.
// app.set('view engine','ejs'); // for  ejs to work, it needs to be saved in a folder within the project folder called 'views'. we then need to create a file called 'home.ejs'


/**
 * ==============================
 *  LISTENING
 * ==============================
*/


app.listen(PORT, console.log(`Your app is running on port ${PORT}`));

app.get('/',function(req,res){
    res.send({ express: 'YOUR EXPRESS BACKEND IS CONNECTED TO ANGULAR FRONTEND' })
})
