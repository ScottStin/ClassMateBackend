const mongoose = require('mongoose');

const homeworkSchema = mongoose.Schema({
    id:{
        type: String,
    },
    name:{
        type: String,
        required: true,
        maxlength: 50,
    },
    description:{
        type: String,
        maxlength: 250,
    },
    dueDate:{
        type: String,
    },
    assignedTeacherId:{
        type: String,
    },
    students:[
        {
            studentId:String,
            completed:Boolean
        },
    ],
    duration:{
        type: Number,
        min: 0,
        max: 999,
    },
    attachment: {
        url:String,
        fileName:String
    },
    schoolId:{
        type: String,
    },
    attempts:{
        type: Number,
        min: 0,
        max: 999,
    },
    // completed:{
    //     type: Boolean,
    // },
    comments:[
        {
            id: String,
            teacherId: String,
            studentId: String,
            date: String,
            duration: Number,
            commentType: String, // 'feedback' | 'submission',
            text: String,
            attachment: {
                url:String,
                fileName:String
            },
            pass: Boolean,
            createdAt: {
                type: Date,
                default: Date.now
            },
        },
    ],
}, {
    timestamps: true
})

module.exports = mongoose.model('homeworkModel', homeworkSchema);

  