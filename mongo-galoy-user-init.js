db.auth("root", "password123")
db = db.getSiblingDB("galoy")
db.createUser({
  user: "galoyTest",
  pwd: "password",
  roles: [
    {
      role: "dbOwner",
      db: "galoy",
    },
  ],
})
