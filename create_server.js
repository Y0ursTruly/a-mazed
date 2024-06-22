//abstraction to use https where it is available, else http
//https is seen as available if "tls_key" and "tls_cert" are environment variables
//where "tls_key" is the private key file location and "tls_cert" is the certificate file location (fullchain.pem for letsencrypt)

//alternatively, these attributes can be passed in as an object as the second argument to the exported module with the same attributes mentioned
//and if the values are NOT strings (like buffers), they would be treated as the key and cert DIRECTLY

//also ensure that "port" is set in either the environment
const https=require('node:https'), http=require('node:http'), fs=require('node:fs')
module.exports=function create_server(responder,options={}){
  let {tls_key,tls_cert}=options
  tls_key ||= process.env.tls_key || process.env.TLS_KEY
  tls_cert ||= process.env.tls_cert || process.env.TLS_CERT
  const ownsCert=tls_key&&tls_cert
  const key=typeof tls_key==="string"? fs.readFileSync(tls_key): tls_key
  const cert=typeof tls_cert==="string"? fs.readFileSync(tls_cert): tls_cert
  const envPort=process.env.port||process.env.PORT
  const PORT=envPort? Number(envPort): (typeof options==="number"?options:(options.port||options.PORT))
  const server=ownsCert?
    https.createServer({key,cert}, responder):
    http.createServer(responder)
  server.listen(PORT||(ownsCert?443:80), function(){
    console.log(`hosting http${ownsCert?'s':''} server @ PORT ${server.address().port}`)
  })
  return server
}
