import { Poppins } from "next/font/google";
import "./globals.css";

const inter = Poppins({ subsets: ["latin"],weight:["400"] });

export const metadata = {
  title: "Create Next App",
  description: "Generated by create next app",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
      <link href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined" rel="stylesheet" />
      </head>
      <body className={inter.className}>{children}</body>
    </html>
  );
}