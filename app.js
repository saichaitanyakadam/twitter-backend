const express = require("express");
const { open } = require("sqlite");
const sqlite3 = require("sqlite3");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcrypt");
const path = require("path");
const app = express();
app.use(express.json());

const dbPath = path.join(__dirname, "twitterClone.db");
let db = null;

const initializeServerAndDB = async () => {
  try {
    db = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    });
    app.listen(3000, () => {
      console.log("listening at http://localhost:3000/");
    });
  } catch (e) {
    console.log(e.message);
    process.exit(1);
  }
};
initializeServerAndDB();

const authorization = async (request, response, next) => {
  let jwtToken;
  const authHeader = request.headers["authorization"];
  if (authHeader !== undefined) {
    jwtToken = authHeader.split(" ")[1];
    if (jwtToken === undefined) {
      response.status(401);
      response.send("Invalid JWT Token");
    } else {
      jwt.verify(jwtToken, "hello_monu", async (error, payload) => {
        if (error) {
          response.status(401);
          response.send("Invalid JWT Token");
        } else {
          request.username = payload.username;
          next();
        }
      });
    }
  } else {
    response.status(401);
    response.send("Invalid JWT Token");
  }
};

app.post("/register/", async (request, response) => {
  const profileDetails = request.body;
  const { username, password, name, gender } = profileDetails;
  const sqlQuery = `
    select *
    from user
    where username="${username}"
    `;
  const userCheck = await db.get(sqlQuery);
  if (userCheck === undefined) {
    if (password.length < 6) {
      response.status(400);
      response.send("Password is too short");
    } else {
      const hashedPassword = await bcrypt.hash(password, 10);
      const sqlQuery = `
      insert into user (username,password,name,gender)
      values("${username}","${hashedPassword}","${name}","${gender}")
      `;
      await db.run(sqlQuery);
      response.send("User created successfully");
    }
  } else {
    response.status(400);
    response.send("User already exists");
  }
});

app.post("/login/", async (request, response) => {
  const loginDetails = request.body;
  const { username, password } = loginDetails;
  const sqlQuery = `
    select *
    from user
    where username="${username}"
    `;
  const userCheck = await db.get(sqlQuery);
  if (userCheck === undefined) {
    response.status(400);
    response.send("Invalid user");
  } else {
    const passCheck = await bcrypt.compare(password, userCheck.password);
    if (passCheck) {
      const payload = {
        username: username,
      };
      const jwtToken = jwt.sign(payload, "hello_monu");
      response.send({ jwtToken });
    } else {
      response.status(400);
      response.send("Invalid password");
    }
  }
});

app.get("/user/tweets/feed/", authorization, async (request, response) => {
  const username = request.username;
  const userIdSqlQuery = `
  select user_id as userId
  from user
  where username="${username}"
  `;
  const { userId } = await db.get(userIdSqlQuery);
  const resultSqlQuery = `
  select user.username,
  tweet.tweet,
  tweet.date_time as dateTime
  from user inner join follower on user.user_id=follower.following_user_id  inner join tweet on tweet.user_id=user.user_id
  where follower_user_id=${userId}
  order by dateTime DESC
  limit 4
  `;
  const dbResponse = await db.all(resultSqlQuery);
  response.send(dbResponse);
});

app.get("/user/following/", authorization, async (request, response) => {
  const username = request.username;
  const userIdSqlQuery = `
  select user_id as userId
  from user
  where username="${username}"
  `;
  const { userId } = await db.get(userIdSqlQuery);
  const resultSqlQuery = `
  select user.name 
  from user inner join follower on user.user_id=follower.following_user_id
  where follower_user_id=${userId}
  `;
  const dbResponse = await db.all(resultSqlQuery);
  response.send(dbResponse);
});

app.get("/user/followers/", authorization, async (request, response) => {
  const username = request.username;
  const userIdSqlQuery = `
  select user_id as userId
  from user
  where username="${username}"
  `;
  const { userId } = await db.get(userIdSqlQuery);
  const resultSqlQuery = `
  select user.name as name
  from user inner join follower on user.user_id=follower.follower_user_id 
  where following_user_id=${userId}
  `;
  const dbResponse = await db.all(resultSqlQuery);
  response.send(dbResponse);
});

app.get("/tweets/:tweetId/", authorization, async (request, response) => {
  const { tweetId } = request.params;
  const username = request.username;
  const userIdSqlQuery = `
  select user_id as userId
  from user
  where username="${username}"
  `;
  const { userId } = await db.get(userIdSqlQuery);
  const resultSqlQuery = `
  select
  tweet.tweet,count(like.like_id) as likes,count(reply.reply_id) as replies,tweet.date_time as dateTime
  
  from user inner join follower on user.user_id=follower.following_user_id  inner join tweet on tweet.user_id=user.user_id  inner join like on like.user_id=user.user_id inner join reply on reply.user_id=user.user_id
  where follower_user_id=${userId} and tweet.tweet_id=${tweetId} 
  group by like.tweet_id,reply.tweet_id
  `;
  const dbResponse = await db.get(resultSqlQuery);
  if (dbResponse === undefined) {
    response.status(401);
    response.send("Invalid Request");
  } else {
    response.send(dbResponse);
  }
});

app.get("/tweets/:tweetId/likes/", authorization, async (request, response) => {
  const { tweetId } = request.params;
  const username = request.username;
  const userIdSqlQuery = `
  select user_id as userId
  from user
  where username="${username}"
  `;
  const { userId } = await db.get(userIdSqlQuery);
  const resultSqlQuery = `
  select username from user 
  where user_id in  (select
    like.user_id
    from user inner join follower on follower.following_user_id=user.user_id inner join tweet on tweet.user_id=user.user_id  inner join like on tweet.tweet_id=like.tweet_id
    where follower_user_id=${userId} and tweet.tweet_id=${tweetId}
  )
  `;
  const dbResponse = await db.all(resultSqlQuery);
  if (dbResponse.length < 1) {
    response.status(401);
    response.send("Invalid Request");
  } else {
    const likesList = dbResponse.map((item) => {
      return item.username;
    });
    response.send({ likes: likesList });
  }
});

app.get(
  "/tweets/:tweetId/replies/",
  authorization,
  async (request, response) => {
    const { tweetId } = request.params;
    const username = request.username;
    const userIdSqlQuery = `
  select user_id as userId
  from user
  where username="${username}"
  `;
    const { userId } = await db.get(userIdSqlQuery);
    const resultSqlQuery = `
  select name,reply.reply from user natural join reply
  where reply.tweet_id=${tweetId} and user_id in  (select
    reply.user_id
    from user inner join follower on follower.following_user_id=user.user_id inner join tweet on tweet.user_id=user.user_id  inner join reply on tweet.tweet_id=reply.tweet_id
    where follower_user_id=${userId} and tweet.tweet_id=${tweetId}
  )
  `;
    const dbResponse = await db.all(resultSqlQuery);
    if (dbResponse.length < 1) {
      response.status(401);
      response.send("Invalid Request");
    } else {
      const likesList = dbResponse.map((item) => {
        return item.username;
      });
      response.send({ replies: dbResponse });
    }
  }
);

app.get("/user/tweets/", authorization, async (request, response) => {
  const username = request.username;
  const userIdSqlQuery = `
  select user_id as userId
  from user
  where username="${username}"
  `;
  const { userId } = await db.get(userIdSqlQuery);
  const resultSqlQuery = `
  select
  tweet.tweet,count(distinct like.like_id) as likes,count(distinct reply.reply_id) as replies,tweet.date_time as dateTime
  from tweet inner inner join like on tweet.tweet_id= like.tweet_id
  inner join reply on tweet.tweet_id=reply.tweet_id
  where tweet.user_id=${userId}
  group by tweet.tweet_id
  `;
  const dbResponse = await db.all(resultSqlQuery);
  if (dbResponse === undefined) {
    response.status(401);
    response.send("Invalid Request");
  } else {
    response.send(dbResponse);
  }
});

app.post("/user/tweets/", authorization, async (request, response) => {
  const tweetDetails = request.body;
  const { tweet } = tweetDetails;
  const username = request.username;
  const userIdSqlQuery = `
  select user_id as userId
  from user
  where username="${username}"
  `;
  const { userId } = await db.get(userIdSqlQuery);
  const resultSqlQuery = `
  insert into tweet (tweet,user_id,date_time)
  values ("${tweet}",${userId},"${new Date()}")
  `;
  await db.run(resultSqlQuery);
  response.send("Created a Tweet");
});

app.delete("/tweets/:tweetId/", authorization, async (request, response) => {
  const { tweetId } = request.params;
  const username = request.username;
  const userIdSqlQuery = `
  select user_id as userId
  from user
  where username="${username}"
  `;
  const { userId } = await db.get(userIdSqlQuery);
  const tweetCheck = `
  select tweet
  from tweet
  where user_id=${userId} and tweet_id=${tweetId}
  `;
  const dbResponse = await db.get(tweetCheck);
  if (dbResponse === undefined) {
    response.status(401);
    response.send("Invalid Request");
  } else {
    const deleteSqlQuery = `
      delete from tweet
      where tweet_id=${tweetId} and user_id=${userId}
      `;
    await db.run(deleteSqlQuery);
    response.send("Tweet Removed");
  }
});
module.exports = app;
