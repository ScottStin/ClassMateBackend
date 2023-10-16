const mongoose = require('mongoose');
const lessonmodels = require('./models/lesson-model');
const lessonTypeModel = require('./models/lesson-type-model')
const databaseName='classEmeanDB';

const connectDB = async () => {
    try {
        const con = await mongoose.connect(`mongodb://127.0.0.1:27017/${databaseName}`, { 
        useNewUrlParser: true,
        useUnifiedTopology: true,
        //useCreateIndex: true
    });
        console.log(`Database connected : ${con.connection.host}`)
    } catch (error) {
        console.error(`Error: ${error.message}`)
        process.exit(1)
    }
}
connectDB()


//   lessonsTest =  new LessonModel( {teacher: users[4].name,length:1, startDate:'Wednesday Dec 7 2022', startTime: '18:00', level:['B2 Upper-Intermediate'], classType:"General English", status:'pending',restricted:false,maxSize:4,studentsEnrolled:[users[7].name,users[9].name],studentsAttended:[users[7].name], description:"General English classes to improve your speaking, reading, writing, vocab and grammar in a conversation settings."})
//     lessonsTest.save().then(l=>{console.log(l)}).catch(e=>{console.log(e)})

// lessonmodels.insertMany(lessons)
//     .then(res=>{
//         console.log("SUCCESS!")
//         console.log(res)
//     }).catch(err=>{
//         console.log("FAIL")
//         console.log(err)
//     })

const lessonTypes = [
    { name: 'General English', shortName: 'General' },
    { name: 'PTE Exam Prep', shortName: 'PTE' },
    { name: 'IELTS Prep', shortName: 'IELTS' },
    { name: 'Cambridge Prep', shortName: 'Cambridge' },
  ];

lessonTypeModel.insertMany(lessonTypes)
    .then(res=>{
        console.log("SUCCESS!")
        console.log(res)
    }).catch(err=>{
        console.log("FAIL")
        console.log(err)
    })
