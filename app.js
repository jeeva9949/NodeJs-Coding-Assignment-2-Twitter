const express = require('express')
const app = express()
const path = require('path')

app.use(express.json())
const {open} = require('sqlite')
const sqlite3 = require('sqlite3')
const bcrypt = require('bcrypt')
const jwt = require('jsonwebtoken')

const dbpath = path.join(__dirname, 'twitterClone.db')
let db = null

const initialiseDBandServer = async () => {
  try {
    db = await open({
      filename: dbpath,
      driver: sqlite3.Database,
    })
    app.listen(3000, () => {
      console.log('server is running in 3000 port ')
    })
  } catch (error) {
    conso9le.log(`the error is ${error.message}`)
    process.exit(1)
  }
}
initialiseDBandServer()

const authenticateToken = (request, response, next) => {
  const {tweet} = request.body
  const {tweetId} = request.params
  let jwtToken
  const authHeader = request.headers['authorization']

  if (authHeader !== undefined) {
    jwtToken = authHeader.split(' ')[1]
  }
  if (jwtToken === undefined) {
    response.status(401)
    response.send('Invalid JWT Token')
  } else {
    jwt.verify(jwtToken, 'jeeva', async (error, payload) => {
      if (error) {
        response.send(401)
        response.send('Invalid JWT Token')
      } else {
        request.payload = payload
        request.tweetId = tweetId
        request.tweet = tweet
        next()
      }
    })
  }
}

// register
app.post('/register', async (request, response) => {
  const {username, name, password, gender} = request.body
  const getUserQuery = `SELECT * FROM user WHERE username = '${username}'`
  const dbuser = await db.get(getUserQuery)
  if (dbuser === undefined) {
    if (password.length < 6) {
      response.status(400)
      response.send('Password is too short')
    } else {
      const hashedPassword = bcrypt.hash(password, 10)
      const createUserQuery = `INSERT INTO 
      user (username,name,password,gender) 
      VALUES (
        '${username}',
        '${name}',
        '${hashedPassword}',
        '${gender}'
        );`
      await db.run(createUserQuery)
      response.send('User created successfully')
      response.status(200)
    }
  } else {
    // user already exits
    response.status(400)
    response.send('User already exists')
  }
})

// login API-2

app.post('/login', async (request, response) => {
  const {username, password} = request.body
  const isUserExitsQuery = `SELECT * FROM user WHERE username = '${username}'`
  const dbUserResponse = await db.get(isUserExitsQuery)
  if (dbUserResponse === undefined) {
    response.status(400)
    response.send('Invalid user')
  } else {
    const isPasswordMatch = await bcrypt.compare(
      password,
      dbUserResponse.password,
    )
    if (isPasswordMatch === true) {
      const payload = {username: username}
      const jwtToken = jwt.sign(dbUserResponse, 'jeeva')
      response.send({jwtToken})
    } else {
      response.status(400)
      response.send('Invalid password')
    }
  }
})

// Returns the latest tweets of people whom the user follows. Return 4 tweets at a time

app.get('/user/tweets/feed/', authenticateToken, async (request, response) => {
  const {payload} = request
  const {user_id, name, username, gender} = payload
  const getTweetsFeedQuery = `
    SELECT 
      username,tweet,
      date_time as dateTime
    FROM 
      follower INNER JOIN tweet ON follower.following_user_id = tweet.user_id
       INNER JOIN user ON user.user_id = follower.following_user_id
    WHERE 
      follower.follower_user_id = ${user_id}
    ORDER BY
      date_time DESC
    LIMIT 4 ;`
  const tweetFeedArray = await db.all(getTweetsFeedQuery)
  response.send(tweetFeedArray)
})

// API-4

app.get('/user/following/', authenticateToken, async (request, response) => {
  const {payload} = request
  const {user_id, name, username, gender} = payload
  const userFollowsQuery = `
    SELECT name 
    FROM 
      user INNER JOIN follower ON user.user_id = follower.following_user_id
    WHERE 
    follower.follower_user_id = ${user_id};`
  const userFollowsArray = await db.all(userFollowsQuery)
  response.send(userFollowsArray)
})

// user Follows API-5

app.get('/user/followers', authenticateToken, async (request, response) => {
  const {payload} = request
  const {user_id, name, username, gender} = payload
  const userFollowersQuery = `
  SELECT 
    name 
  FROM 
    user INNER JOIN follower ON user.user_id = follower.follower_user_id
  WHERE 
    follower.following_user_id = ${user_id};`
  const userFollowerArray = await db.all(userFollowersQuery)
  response.send(userFollowerArray)
})

app.get('/tweets/:tweetId', authenticateToken, async (request, response) => {
  const {tweetId} = request
  const {payload} = request
  const {user_id, name, username, gender} = payload
  const tweetsQuery = `SELECT * FROM tweet WHERE tweet_id = ${tweetId}`
  const tweetsResult = await db.get(tweetsQuery)
  const userFollowersQuery = `
    SELECT 
      *
    FROM follower INNER JOIN user ON user.user_id =  follower.following_user_id
    WHERE 
      follower.follower_user_id = ${user_id};`
  const userFollowers = await db.all(userFollowersQuery)
  if (
    userFollowers.some(item => item.following_user_id === tweetsResult.user_id)
  ) {
    const getTweetDetailsQuery = `
          SELECT tweet,
                  COUNT(DISTINCT(like.like_id)) AS likes,
                  COUNT(DISTINCT(reply.reply_id)) AS resplies,
                  tweet.date_time as dateTime
          FROM tweet INNER JOIN like ON tweet.tweet_id = like.tweet_id INNER JOIN reply ON reply.tweet_id = tweet.tweet_id
          WHERE
            tweet.tweet_id = ${tweetId} AND tweet.user_id = ${userFollowers[0].user_id};`
    const tweetDetails = await db.get(getTweetDetailsQuery)
    response.send(tweetDetails)
  } else {
    response.status(401)
    response.send('Invalid Request')
  }
})

app.get(
  '/tweets/:tweetId/likes',
  authenticateToken,
  async (request, response) => {
    const {tweetId} = request
    const {payload} = request
    const {user_id, name, username, gender} = payload
    const getLikedUserQuery = `
      SELECT
        *
      FROM
        follower INNER JOIN tweet ON tweet.user_id = follower.following_user_id INNER JOIN line ON like.tweet_id = tweet.tweet_id
        INNER JOIN user ON user.user_id = like.user_id
      WHERE
        tweet.tweet_id = ${tweetId} AND follower.follower_user_id = ${user_id};`
    const likedUsers = await db.all(getLikedUserQuery)
    if (likedUsers.length !== 0) {
      let likes = []
      const getNamesArrary = likedUsers => {
        for (let item of likedUsers) {
          likes.push(item.username)
        }
      }
      getNamesArrary(likedUsers)
      response.send({likes})
    } else {
      response.status(401)
      response.send('Invalid Request')
    }
  },
)

// API-8

app.get(
  '/tweets/:tweetId/replies',
  authenticateToken,
  async (request, response) => {
    const {tweetId} = request
    const {payload} = request
    const {user_id, name, username, gender} = payload
    const getRepliedUserQQuery = `
    SELECT 
      * 
    FROM 
      follower 
      INNER JOIN tweet ON tweet.user_id = follower.following_user_id INNER JOIN reply ON  reply.tweet_id = tweet.tweet_id
      INNER JOIN user ON user.user_id = reply.user_id
      WHERE 
        tweet.tweet_id = ${tweetId} AND follower.follower_user_id = ${user_id};`

    const repliedUsers = await db.all(getRepliedUserQQuery)
    if (repliedUsers.length !== 0) {
      let replies = []
      const getNamesArrary = repliedUsers => {
        for (let item of repliedUsers) {
          let object = {
            name: item.name,
            reply: item.reply,
          }
          replies.push(object)
        }
      }
      getNamesArrary(repliedUsers)
      response.send('Invalid Request')
    }
  },
)

// API-9

app.get('/user/tweets', authenticateToken, async (request, response) => {
  const {payload} = request
  const {user_id, name, username, gender} = payload
  const getTweetsDetailsQuery = `
        SELECT 
          tweet.tweet as tweet,
          COUNT(DISTINCT(like.like_id)) AS likes,
          COUNT(DISTINCT(reply.reply_id)) as replies,
          tweet.date_time as dateTime
        FROM 
          user INNER JOIN tweet ON user.user_id = tweet.user_id INNER JOIN like ON like.tweet_id = tweet.tweet_id
        WHERE 
          user.user_id = ${user_id}
        GROUP BY 
          tweet.tweet_id;`
  const tweetDeatils = await db.all(getTweetsDetailsQuery)
  response.send(tweetDeatils)
})

// API-10

app.post('/user/tweets', authenticateToken, async (request, response) => {
  const {tweet} = request
  const {tweetId} = request
  const {payload} = request
  const {user_id, name, username, gender} = payload
  const postTweetQuery = `
    INSERT INTO 
      tweet(tweet,user_id)
    VALUES(
      '${tweet}',
      ${user_id}
    )`
  await db.run(postTweetQuery)
  response.send('Created a Tweet')
})

app.delete('/tweets/:tweetId', authenticateToken, async (request, response) => {
  const {tweetId} = request
  const {payload} = request
  const {user_id, name, username, gender} = payload
  const selectUserQuery = `SELECT * FROM tweet WHERE tweet.user_id = ${user_id} AND tweet.tweet_id = ${tweetId};`
  const tweetUser = await db.all(selectUserQuery)
  if (tweetUser.length !== 0) {
    const deleteTweetQuery = `
      DELETE FROM tweet
      WHERE
        tweet.user_id = ${user_id} AND tweet.tweet_id = ${tweetId};`
    await db.run(deleteTweetQuery)
    response.send('Tweet Removed')
  } else {
    response.status(401)
    response.send('Invalid Request')
  }
})

module.exports = app
