import { initializeApp } from "firebase/app";
import { getDatabase } from "firebase/database"; 

const firebaseConfig = {
  apiKey: "AIzaSyAabH8aG5ijcx2DbzQrx5CW2yrDZm7qXGs",
  authDomain: "camera-mlx90640.firebaseapp.com",
  databaseURL: "https://camera-mlx90640-default-rtdb.firebaseio.com",
  projectId: "camera-mlx90640",
  storageBucket: "camera-mlx90640.firebasestorage.app",
  messagingSenderId: "549162212380",
  appId: "1:549162212380:web:d3c75f48b832ef0efd53d9",
};

const app = initializeApp(firebaseConfig);

export const db = getDatabase(app);