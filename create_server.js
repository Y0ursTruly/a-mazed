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
  let key=typeof tls_key==="string"? fs.readFileSync(tls_key): tls_key
  let cert=typeof tls_cert==="string"? fs.readFileSync(tls_cert): tls_cert
  const envPort=process.env.port||process.env.PORT
  const PORT=envPort? Number(envPort): (typeof options==="number"?options:(options.port||options.PORT))
  const server=ownsCert?
    https.createServer({key,cert}, responder):
    http.createServer(responder)
  server.listen(PORT||(ownsCert?443:80), function(){
    console.log(`hosting http${ownsCert?'s':''} server @ PORT ${server.address().port}`)
  })
  if(!options.key_renewer){
    options.key_renewer = typeof tls_key==="string"?
      function(){return fs.readFileSync(tls_key)}:
      function(){return tls_key}
  }
  if(!options.cert_renewer){
    options.cert_renewer = typeof tls_cert==="string"?
      function(){return fs.readFileSync(tls_cert)}:
      function(){return tls_cert}
  }
  if(ownsCert){
    const {key_renewer,cert_renewer}=options
    //every 60 seconds check to renew certificate data
    setInterval(async function(){
      //the key_renewer and cert_renewer if given can be asynchronous
      const key_next = await key_renewer()
      const cert_next = await cert_renewer()
      if(key_next===key && cert_next===cert) return null; //no changes to be made
      key = key_next
      cert = cert_next
      server.setSecureContext({key,cert})
    },6e4)
  }
  return server
}
