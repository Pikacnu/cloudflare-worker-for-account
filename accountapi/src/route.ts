
export class Route{
  #path:string
  #req:Request
  callback:Response
  constructor(path:string,req:Request){
    this.#path = path;
    this.#req = req;
    this.callback;
  }
  #checkroute(pathname:string){
    if(this.callback)return null;
    if(!(pathname.startsWith(this.#path)))return null
    return pathname.replace(this.#path,'')
  }
  #checkpath(path:string,url:string){
    let success = true;
    const origin = path.split('/')
    let length = path.split('/').length
    const target = url.split('/')
    for (let i = 0;i<length;i++){
      if(origin[i] === ':'||origin[i] === '')continue
      if(origin[i] !== target[i])success=false
    }
    return success
  }
  async get(path:string,callback:Function){
    if(this.#req === undefined)return;
    if(this.#req.method !== 'GET') return;
    const url = this.#checkroute(new URL(this.#req.url).pathname)
    if(url === null)return;
    if(!this.#checkpath(path,url))return;
    this.callback = await callback(this.#req,url.replace(path,''))
  }
  async post(path:string,callback:Function){
    if(!this.#req.headers.get("content-type")?.includes("application/json")) return;
    if(this.#req === undefined)return;
    if(this.#req.method !== 'POST') return;
    const url = this.#checkroute(new URL(this.#req.url).pathname)
    if(url === null)return;
    if(!this.#checkpath(path,url))return;
    this.callback = await callback(this.#req,url.replace(path,''))
  }
}