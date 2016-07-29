var chance = new require('chance')(),
    express = require('express'),
    request = require('request'),
    jsonpatch = require('fast-json-patch');

var data = [];
var interval = setInterval(function() { if(data.length < 10) data.push({ message: chance.paragraph({ sentences: 1 }) }); else data = []; }, 1000);

var app = express();
app.get('/data', function(req, res) { res.json(data); });
app.listen(3000);

var proxy = express();
var polls = {};

proxy.get('/observe', function(req, res) {
  var url = req.query.url;
  
  res.connection.setTimeout(0);
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive'
  });
  
  request(url, function(err, req, data) {
    res.write(data + '\n\n');
    
    polls[url] = polls[url] || new Subscription(url);
    polls[url].connections.push(res);
    
    res.on('close', function() {
      console.log('Request closed');
      polls[url].remove(res);
      
      if (polls[url].connections.length === 0) {
        console.log('No more subscriptions to [' + url + ']');
        clearInterval( polls[url].interval);
        polls[url] = null;
        delete polls[url];
      }
    });
  });
});

proxy.listen(9000);

function Subscription(url) {
  this.url = url;
  this.data = null;
  this.connections = [];
  
  this.worker = function() {
    request(url, function(err, req, data) {
      var json = JSON.parse(data);
      this.data = this.data || json; // Incase of initial set
      
      var diff = jsonpatch.compare(this.data, json);
      this.data = json;
      
      if (diff.length > 0) {
        this.connections.forEach(function(res) {
          res.write(JSON.stringify(diff) + '\n\n');
        });
      }
    }.bind(this));
  }.bind(this);
  
  this.interval = setInterval(this.worker, 1000);
  
  this.remove = function(res) {
    var i = this.connections.indexOf(res);
    if (i !== -1) this.connections.splice(i, 1);
  }
}