/**
 * Welcome to Cloudflare Workers! This is your first worker.
 *
 * - Run "npm run dev" in your terminal to start a development server
 * - Open a browser tab at http://localhost:8787/ to see your worker in action
 * - Run "npm run deploy" to publish your worker
 *
 * Learn more at https://developers.cloudflare.com/workers/
 */

import { D1Database } from '@cloudflare/workers-types'
import { Route } from './route';
import { lib,PBKDF2 } from 'crypto-js';

interface ENV{
  DB:D1Database,
  MAX_SESSION_COUNT:number,
  MAX_ACCOUNT_COUNT:number,
}

export default {
  async fetch(req:Request, env:ENV) {
    const db = env.DB
    async function auth(req:Request):Promise<{
      username:string,
      session:string
    }>{
      const session = req.headers.get('Auth')?.toString();
      if(!session)return {username:'',session:''}

      await db.prepare(`DELETE FROM Sessions WHERE expire <= (DATETIME('now'));`).all();
      const result = (await db.prepare(`SELECT (username) FROM Sessions WHERE session = ?1;`).bind(session).all()).results[0];
      await db.prepare(`UPDATE Sessions SET expire = (DATETIME('now','+7 day')) WHERE session = ?1;`).bind(session).all()
      if(!result)return {username:'',session:session};
      const username = typeof result['username'] === 'string'?result['username']:'';
      return {username:username,session:session};
    }

    const api = new Route('/api',req)
    await api.post('/login',async (req:Request)=>{
      const body = await req.json();
      if(!body.username)return Response.json({
        status:400,
        message:'need username'
      })
      if(!body.password)return Response.json({
        status:400,
        message:'need password'
      })
      const username = body.username;
      const password = body.password;
      const result = (await db.prepare(`SELECT password,salt FROM Account WHERE username = ?1`).bind(username).all()).results[0];
      if(!result){
        //create account

        const accountdata = (await db.prepare(`SELECT COUNT(username) FROM Account WHERE username = ?1`).bind(username).all()).results
        const accountCount = typeof accountdata['COUNT(username)'] === 'number'?accountdata['COUNT(username)']:0;

        if(accountCount >= env.MAX_ACCOUNT_COUNT)return Response.json({
          status:500,
          message:`There are too many Account registered`
        })

        const salt = lib.WordArray.random(128 / 8).toString();
        const modifiedPassword = PBKDF2(password,salt,{
          keySize:128/32,
        }).toString()
        await db.prepare(`INSERT INTO Account (username,password,salt) VALUES (?1,?2,?3)`).bind(username,modifiedPassword,salt).all()
        const session = lib.WordArray.random(128 / 8).toString()
        await db.prepare(`INSERT INTO Sessions (username,session) VALUES (?1,?2)`).bind(username,session).all();
        return Response.json({
          status:200,
          message:"Create a new Account",
          data:{
            session:session
          }
        });
      };
      //check password
      const salt = typeof result.salt === 'string'
      ? result.salt
      : undefined;
      const realpassword = result.password;

      if(
        PBKDF2(password,salt||'',{
          keySize:128/32,
        }).toString()
        ===
        realpassword
      ){
        const sessiondata = (await db.prepare(`SELECT COUNT(session) FROM Sessions WHERE username = ?1`).bind(username).all()).results[0];
        const sessionCount = typeof sessiondata['COUNT(session)'] === 'number'?sessiondata['COUNT(session)']:0;
        if(sessionCount >= env.MAX_SESSION_COUNT -1 )return Response.json({
          status:500,
          message:`There are too many Session Created`
        })
        const session = lib.WordArray.random(128 / 8).toString()
        await db.prepare(`INSERT INTO Sessions (username,session) VALUES (?1,?2)`).bind(username,session).all();
        return Response.json({
          status:200,
          message:`Create a new Session`,
          data:{
            session:session
          }
        })
      }
      return ({
        status:403,
        message:`Wrong username or password`
      })
    })


    await api.get('/user',async (req:Request)=>{
      const {username,session} = await auth(req);
      if(username === '')return Response.json({
        status:403,
        message:`Not vaild Session`
      })
      return Response.json({
        status:200,
        message:`Success get user's data`,
        data:{
          session:session,
          username:username
        }
      })
    })
    await api.get('/book/:/text',async(req:Request,path:string)=>{
      const {username,session} = await auth(req)
      if(username === '')return Response.json({
        status:403,
        message:'Not vaild Session'
      })
      const bookid = path.split('/')[2]
      if(bookid === '')return Response.json({
        status:400,
        message:'bookid can not be blank'
      })
      const textdata = ((await db.prepare(`SELECT (text) FROM ReadHistory WHERE username = ?1 AND bookid = ?2`).bind(username,bookid).all()).results[0])
      if(!textdata)return Response.json({
        status:400,
        message:'Can not find text count'
      })
      return Response.json({
        status:200,
        message:`Get ${bookid} text count`,
        data:{
          text:textdata.text
        }
      })
    })
    await api.post('/book/:/text',async(req:Request,path:string)=>{
      const {username,session} = await auth(req)
      if(username === '')return Response.json({
        status:403,
        message:'Not vaild Session'
      })
      const bookid = path.split('/')[2]
      if(bookid === '')return Response.json({
        status:400,
        message:'Bookid can not be blank'
      })
      const body = await req.json()
      const text = body.text;
      if(typeof text !=='number' || text === null || text === undefined)return Response.json({
        status:400,
        message:'Text in body can not be blank'
      })
      await db.prepare(`REPLACE INTO ReadHistory (username,bookid,text) VALUES (?1,?2,?3)`).bind(username,bookid,text).all()
      return Response.json({
        status:200,
        message:'Update text count',
        data:{
          text:text
        }
      })
    })

    if(api.callback){
      api.callback.headers.append('Access-Control-Allow-Origin','*')
      return api.callback;
    }
    const notfound = Response.json({
      status:404,
      message:"Not Found"
    });
    notfound.headers.append('Access-Control-Allow-Origin','*')
    return notfound
  },
};