import { db } from "@/db";
import { users } from "@/db/schema";

/** Records a member the first time they open the app; the email follows the Gateway's. */
export async function rememberUser(user: { id: string; email: string }) {
  await db
    .insert(users)
    .values({ id: user.id, email: user.email })
    .onConflictDoUpdate({ target: users.id, set: { email: user.email } });
}
