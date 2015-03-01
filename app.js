var express = require('express');
var request = require('request');
var app = express();
var server = require('http').createServer(app);
var session = require('express-session');
var bodyparser = require('body-parser');
var qs = require('querystring');
var exphbs = require('express-handlebars');
var cookieParse = require('cookie-parser');
var braintree = require('braintree');
var GitHubApi = require("github");
var io = require('socket.io')(server);

var github = new GitHubApi({
    // required
    version: "3.0.0",
    // optional
    debug: true,
    headers: {
        "user-agent": "My-Cool-GitHub-App" // GitHub is happy with a unique user agent
    }
});

var base_url = 'https://github.com/login/oauth';
var base_url_api = 'https://api.github.com';

var my_client_id = '62f7bc9f27737728092d';
var my_client_secret = '6a4ce1ba5e3c4a3de85e50507f2bf38d5888b308';

server.listen(3000);

var db = {};
app.use(bodyparser.json());
app.use(bodyparser.urlencoded({extended: false}));

app.use(session({secret: 'hjkadskjhas'}));

// set users log in
// app.use(function (req, res, next) {
//     if(!req.session.user) {
//         res.render('index');
//     } else {
//         next();
//     }
// });

app.engine('handlebars', exphbs());
app.set('view engine', 'handlebars')

app.get('/', function(req, res) {
    var user = req.session.user;
    var token = req.session.token;
    console.log(user);
    console.log(token);

    // authenticate to github and get repos
    addRepos(user, token, function (data) {
        res.render('index', {repos:data});
    });

    // res.render('index', {repos: []});
});

app.get('/login', function(req, res) {
  res.redirect(307, base_url + '/authorize?client_id=' + my_client_id + '&scope=user:email');
});

var gateway = braintree.connect({
  environment: braintree.Environment.Sandbox,
  merchantId: "2kbg5zycpmt3ftkq",
  publicKey: "jqwnrfgx3jv76jfz",
  privateKey: "1775ef9694c578b906700a249ef79e3e"
});

app.get('/callback', function(req, res) {
  var auth_code = req.query.code;

  request.post({
    url: base_url + '/access_token',
    form: {
        client_id: my_client_id,
        client_secret: my_client_secret,
        code: auth_code
      }
    },
    function(err, resp, body) {
    //   db[body]
      var token = qs.parse(body).access_token;
      console.log(token);
      request.get({
          headers: {
              'User-Agent': 'request-fizt'
          },
          url: base_url_api + '/user?access_token='+token,
    },
        function(err, resp, body) {
        //   db[body.login] = token;
            req.session.user = JSON.parse(body).login;
            req.session.token = token;

            gateway.clientToken.generate({
              customerId: 12345
            },function (err, response) {
                var clientToken = response.clientToken
                res.render('payment', { nonce: clientToken });
            });
        }
      );
    }
  );
});

app.post("/payment", function (req, res) {
  req.session.nonce = req.body.payment_method_nonce;

  res.redirect('/');

});


app.post('/webhook', function (req,res) {
    console.log(req.body);
    io.sockets.emit('hook', {repo: req.body.repository.name});
    gateway.transaction.sale({
      amount: '0.01',
      paymentMethodNonce: 'nonce-from-the-client'
  }, function (err, resp) {
      res.end();
    });
});








function addRepos(username, token, callback) {
    // authenticate to github and get repos
    github.authenticate({
        type: "oauth",
        token: token
    });

    // Get user repos and add to collection
    var repos = github.repos.getFromUser({
        user: username
    }, function (err, data) {

        var repoArray = [];
        for (var i = 0; i < data.length; i++ ) {
            var repo = {name:data[i].name};

            repoArray.push(repo);
        }

        callback(repoArray);
    });


    // addCommits(username, token);
}


function createWebhook(oauth, username, repo, callback) {
    var url = 'https://api.github.com/repos/'+username+'/'+repo+'/hooks';
    var options = {
        headers: {
            Authorization: 'token '+ oauth
        },
        data: {
            name: 'web'
        },
        active: true,
        config: {
            "url": "http://45c972de.ngrok.com/webhook"
        },
        events: ['push'],
        user: username,
        repo: repo
    }
    HTTP.call('POST', url, options );
}
