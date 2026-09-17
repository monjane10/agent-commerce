import "dotenv/config";

import {
  iniciarAplicacao,
} from "./cli/main.js";


iniciarAplicacao().catch(
  (error) => {
    console.error(
      "\nErro fatal:",
    );


    console.error(
      error,
    );


    process.exit(1);
  },
);
