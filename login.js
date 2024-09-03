const email = process.argv[2];
const password = process.argv[3];

if (!email || !password) {
    console.log('Usage: ./login.js <email> <password>');
    process.exit(1);
}

const encodesCredentials = Buffer.from(`${email}:${password}`).toString('base64');

console.log(encodesCredentials);