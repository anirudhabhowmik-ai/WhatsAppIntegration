import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

const connectDB = async () => {
  try {
    console.log('Attempting to connect to MongoDB Atlas...');
    
    const conn = await mongoose.connect(process.env.MONGO_URI, {
      serverSelectionTimeoutMS: 30000,
      socketTimeoutMS: 45000,
      family: 4, // Force IPv4 (helps with DNS issues)
    });
    
    console.log(`✅ MongoDB Atlas Connected: ${conn.connection.host}`);
    return true;
  } catch (error) {
    console.error('❌ MongoDB Atlas Connection Error:', error.message);
    console.log('\n🔧 Troubleshooting steps:');
    console.log('1. Check your internet connection');
    console.log('2. Flush DNS cache:');
    console.log('   - Open Command Prompt as Administrator');
    console.log('   - Run: ipconfig /flushdns');
    console.log('3. Try using Google DNS:');
    console.log('   - Control Panel → Network → Change adapter settings');
    console.log('   - Properties → IPv4 → Use DNS: 8.8.8.8 and 8.8.4.4');
    console.log('4. Restart your computer');
    console.log('5. Check MongoDB Atlas status: https://status.mongodb.com\n');
    
    process.exit(1);
  }
};

export default connectDB;