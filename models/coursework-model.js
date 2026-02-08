const mongoose = require('mongoose');
const MAX_QUESTIONS = 100;

const courseworkSchema = new mongoose.Schema({
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
        required: true,
        maxlength: 500,
    },
    studentsEnrolled:[
        { type: String }
    ],
    studentsCompleted: [
        { type: String }
    ],
    courseCoverPhoto:{
        url:String,
        fileName:String
    },
    questions: [
      {
        // _id: { type: String },
        questionId: { type: String },
        studentsCompleted: [{type: String}]
       }
    ],
    casualPrice:{ 
        type: Number,
        default: 0, 
        min: 0, 
        max: 1000,
    },
    estimatedMinutesToComplete:{ 
        type: Number,
        default: 60, 
        min: 0, 
        max: 100000,
    },
    schoolId:{
        type: String,
        required: true,
    },
}, {
    timestamps: true
})

const courseworkPageElementSchema = new mongoose.Schema({
  id: {
    type: String,
    required: true,
  },
  type: {
    type: String, // assuming enum values are stored as strings
    required: true,
  },
  x: {
    type: Number,
    required: true,
  },
  y: {
    type: Number,
    required: true,
  },
  width: {
    type: Number,
    required: true,
  },
  height: {
    type: Number,
    required: true,
  },
  innerHtmlText: {
    type: String,
    required: false,
  },
  src: {
    type: String,
    required: false,
  },
  elementStyles: {
    backgroundColor: {
      type: String,
      required: false,
    },
    backgroundTransparency: {
      type: Number,
      required: false,
    },
    borderColor: {
      type: String,
      required: false,
    },
    hideBorder: {
      type: Boolean,
      required: false,
    },
  },
}, {
  timestamps: true,
});

courseworkSchema.path('questions').validate(function(value) {
  return value.length <= MAX_QUESTIONS;
}, `You can only have up to ${MAX_QUESTIONS} questions.`);

const courseworkModel = mongoose.model('courseworkModel', courseworkSchema);
const courseworkInfoPageModel = mongoose.model('courseworkInfoPageModel', courseworkPageElementSchema);


module.exports = {
  courseworkModel,
  courseworkInfoPageModel,
  courseworkPageElementSchema,
};
