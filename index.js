#! /usr/bin/env node

const crypto = require("crypto");
const { networks, initEccLib } = require("bitcoinjs-lib");
const ecc = require("@bitcoinerlab/secp256k1");
const { ECPairFactory } = require("ecpair");
const { BIP32Factory } = require("bip32");
const ECPair = ECPairFactory(ecc);
const bip32 = BIP32Factory(ecc);
initEccLib(ecc);

const testnet = networks.testnet;
const mainnet = networks.bitcoin;
const prefixes = new Map([
	['tpub', { bip32: { public: 0x043587CF, private: 0x04358394 }, network: testnet }],
	['vpub', { bip32: { public: 0x045f1cf6, private: 0x045f18bc }, network: testnet }],
	['upub', { bip32: { public: 0x044a5262, private: 0x044a4e28 }, network: testnet }],
	['xpub', { bip32: { public: 0x0488B21E, private: 0x0488ADE4 }, network: mainnet }],
	['ypub', { bip32: { public: 0x049d7cb2, private: 0x049d7878 }, network: mainnet }],
	['zpub', { bip32: { public: 0x04b24746, private: 0x04b2430c }, network: mainnet }],
]);

document.querySelector('#go').addEventListener('click', () => {
	const xpubStr = document.querySelector('#xpub').value;
	const wif = document.querySelector('#wif').value;
	
	if (!xpubStr || !wif) {
		print('Invalid input');
		return;
	}

	const prefix = prefixes.get(xpubStr.substring(0, 4));
	const network = {...prefix.network};
	network.bip32 = prefix.bip32;

	const childPrivKey = ECPair.fromWIF(wif, network).privateKey;
	const bigPrivKey = BigInt(`0x${childPrivKey.toString('hex')}`);

	let xpub = bip32.fromBase58(xpubStr, network);
	let recvXpub = xpub.derive(0);

	let privFound;

	const N = BigInt('0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141');
	const limit = 20;

	// find the private key index
	for (let index = 0; index < limit; index++) {
		console.log(`index: ${index}`);
		let bufIndex = Buffer.alloc(4);
		bufIndex.writeInt32BE(index);

		let data = Buffer.concat([recvXpub.publicKey, bufIndex]);
		let hmac = crypto.createHmac('sha512', recvXpub.chainCode).update(data).digest();

		let left = hmac.subarray(0, 32);
		let bigLeft = BigInt(`0x${left.toString('hex')}`);
		
		let calcKey = (bigPrivKey - bigLeft) % N;
		if (calcKey < 0n) {
			calcKey += N;
		}

		let calcHex = calcKey.toString(16).padStart(64, '0');
		let calcBuffer = Buffer.from(calcHex, 'hex');

		let parentPrivKey = ECPair.fromPrivateKey(calcBuffer, { network: network });
		let pubkey = parentPrivKey.publicKey;
		if (pubkey.equals(recvXpub.publicKey)) {
			console.log(`found`);
			privFound = parentPrivKey;
			break;
		}
	}

	if (!privFound) {
		console.log('not found');
		print('Data does not match. Either this private key is not part of this xpub or it\'s too deep');
		return;
	}

	const xprv = bip32.fromPrivateKey(privFound.privateKey, recvXpub.chainCode, network);
	const bigParentPrivKey = BigInt(`0x${xprv.privateKey.toString('hex')}`);

	let data = Buffer.concat([xpub.publicKey, Buffer.alloc(4)]);
	let hmac = crypto.createHmac('sha512', xpub.chainCode).update(data).digest();
	let left = hmac.subarray(0, 32);
	let bigLeft = BigInt(`0x${left.toString('hex')}`);
	
	let calcKey = (bigParentPrivKey - bigLeft) % N;
	if (calcKey < 0n) {
		calcKey += N;
	}
	
	let calcHex = calcKey.toString(16).padStart(64, '0');
	let calcBuffer = Buffer.from(calcHex, 'hex');

	let parentXprv = bip32.fromPrivateKey(calcBuffer, xpub.chainCode, network);
	console.log(parentXprv.toBase58());
	print(parentXprv.toBase58());

});

document.querySelector('#clear').addEventListener('click', () => {
	document.querySelector('#xpub').value = '';
	document.querySelector('#wif').value = '';
});

const print = (msg) => {
	const result = document.querySelector('#result');
	result.innerHTML = '';
	const span = document.createElement('span');
	span.style.border = '5px dotted black';
	span.style.padding = '5px';
	span.innerHTML = msg;
	result.append(span);
};