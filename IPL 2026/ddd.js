//index.................

import express from "express"; 
import mongoose from "mongoose"; 
import bodyParser from "body-parser"; 
import dotenv from "dotenv"; 

import route from "./routes/userRoute.js";

const app = express();


app.use(bodyParser.json());


dotenv.config();


const PORT = process.env.PORT || 5000;


const MONGOURL = process.env.MONGO_URL;


mongoose
 .connect(MONGOURL)
 .then(() => {
   console.log("Database connected successfully."); 
  
   app.listen(PORT, () => {
     console.log(`Server is running on port : ${PORT}`); 
   });
 })
 .catch((error) => console.log(error)); 

app.use("/api/user", route);

//route..............

import express from "express";

import { create, deleteUser, fetch, update } from "../controller/userController.js";

const route = express.Router();

route.get("/getallusers", fetch); 
route.post ("/create", create); 
route.put("/update/:id", update); 
route.delete("/delete/:id", deleteUser); 

export default route;

//controllers...................................



import User from "../model/userModel.js";



export const create = async(req, res)=>{
   try {
       const userData = new User( req.body);
       const {email} = userData;
       const userExist = await User.findOne({email})
       if (userExist){
           return res.status(400).json({message : "User already exists."})
       }
       const savedUser = await userData.save();
       res.status(200).json(savedUser)
   } catch (error) {
       res.status(500).json({error : "Internal Server Error. "})
   }
}



export const fetch = async (req, res)=>{
   try {
       const users = await User.find();
       if(users.length === 0 ){
           return res.status(404).json({message : "Users not Found."})
       }
       res.status(200).json(users);
   } catch (error) {
       res.status(500).json({error : " Internal Server Error. "})
   }
}



export const update = async (req, res)=>{
   try {
       const id = req.params.id;
       const userExist = await User.findOne({_id:id})
       if (!userExist){
           return res.status(404).json({message : "User not found."})
       }
       const updateUser = await User.findByIdAndUpdate(id, req.body, {new : true});
       res.status(201).json(updateUser);
   } catch (error) {
       res.status(500).json({error : " Internal Server Error. "})
   }
}



export const deleteUser = async (req, res)=>{
   try {
       const id = req.params.id;
       const userExist = await User.findOne({_id:id})
       if(!userExist){
           return res.status(404).json({message : " User Not Found. "})
       }
       await User.findByIdAndDelete(id);
       res.status(201).json({message : " User deleted Successfully."})
   } catch (error) {
       res.status(500).json({error : " Internal Server Error. "})
   }
}



//model............................
import mongoose from "mongoose";



const userSchema = new mongoose.Schema({
 name: {
   type: String,
   required: true,
 },
 email: {
   type: String,
   required: true,
 },
 address: {
   type: String,
   required: true,
 },
});

export default mongoose.model("users", userSchema);



