import "dotenv/config";
import { sendDailyReminders } from "../lib/reminders";

sendDailyReminders()
  .then((result) => {
    console.log("Done:", result);
    process.exit(0);
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
