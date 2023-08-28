import { expect } from "chai";
import { IndexedMerkleTree } from "./tree/indexedMerkleTree.js";
import { Issuer } from "./state/state.js";
import {
    getECDSAPublicKeyFromPrivateKey,
    getEDDSAPublicKeyFromPrivateKey,
    stateTransitionByEDDSASignature
} from "./utils/keys.js";
import {
    Crs,
    newBarretenbergApiAsync,
    RawBuffer,
} from "@aztec/bb.js/dest/node/index.js";
import { executeCircuit, compressWitness } from "@noir-lang/acvm_js";
import circuit from "./circuits/state/target/state.json" assert { type: "json" };
import { decompressSync } from "fflate";
import { convertToHexAndPad, object2Array } from "./utils/bits.js";
import { CryptographyPrimitives } from "./crypto/index.js";

describe("test", () => {
    let poseidon: any;
    let acirBuffer: any;
    let acirBufferUncompressed: any;
    let api: any;
    let acirComposer: any;
    let crypto: CryptographyPrimitives;

    before(async () => {
        crypto = await CryptographyPrimitives.getInstance();
        poseidon = crypto.poseidon;
        acirBuffer = Buffer.from(circuit.bytecode, "base64");
        acirBufferUncompressed = decompressSync(acirBuffer);
        api = await newBarretenbergApiAsync(4);
        const [_exact, circuitSize, _subgroup] = await api.acirGetCircuitSizes(
            acirBufferUncompressed
        );
        const subgroupSize = Math.pow(2, Math.ceil(Math.log2(circuitSize)));
        const crs = await Crs.new(subgroupSize + 1);
        await api.commonInitSlabAllocator(subgroupSize);
        await api.srsInitSrs(
            new RawBuffer(crs.getG1Data()),
            crs.numPoints,
            new RawBuffer(crs.getG2Data())
        );

        acirComposer = await api.acirNewAcirComposer(subgroupSize);
    });


    it("poseidon", async () => {
        const res = poseidon([1, 2]);
        expect(poseidon.F.toString(res)).equal(
            BigInt(
                "0x115cc0f5e7d690413df64c6b9662e9cf2a3617f2743245519e19607a4417189a"
            ).toString(10)
        );
    });

    it("js insert tree", async () => {
        //   root
        //    /\
        //   a  zero[2]
        //  /  \
        // b    c
        // /\   /\
        //0  3 1  zero[0]
        //1  0 3
        //2  0 1

        var tree = new IndexedMerkleTree(3, poseidon);

        tree.insert(3n);
        tree.insert(1n);

        var leaf1 = tree.hash([0n, 1n, 2n]);
        var leaf2 = tree.hash([3n, 0n, 0n]);
        var leaf3 = tree.hash([1n, 3n, 1n]);

        var c = tree.hash([leaf3, tree.zero[0]]);
        var b = tree.hash([leaf1, leaf2]);
        var a = tree.hash([b, c]);
        var root = tree.hash([a, tree.zero[2]]);

        expect(root).equal(tree.getRoot());

        /// check path
        var res = tree.getPathProofLow(1n);
        if (res != null) {
            var { leafLow: leaf, pathLow: path } = res;
            var leaf4 = tree.hash([leaf.val, leaf.nextVal, BigInt(leaf.nextIdx)]);
            var c2 = tree.hash([leaf4, path[0]]);
            var a2 = tree.hash([path[1], c2]);
            var root2 = tree.hash([a2, path[2]]);

            expect(root).equal(root2);
        }
    });

    // it("circuit insert tree", async () => {

    //     //   root
    //     //    /\
    //     //   a  zero[2]
    //     //  /  \
    //     // b    c
    //     // /\   /\
    //     //0  3 1  zero[0]
    //     //1  0 3
    //     //2  0 1

    //     var tree = new IndexedMerkleTree(3, poseidon);

    //     tree.insert(3n);
    //     var input = tree.insert(1n);

    //     if (input != null) prove_and_verify(input);

    // })

    it("circuit state transition", async () => {

        var privateKey1 = BigInt("123");
        var privateKey2 = BigInt("12");
        var privateKey3 = BigInt("34");

        var pubkey1 = await getEDDSAPublicKeyFromPrivateKey(privateKey1);
        var pubkey2 = await getEDDSAPublicKeyFromPrivateKey(privateKey2);
        var pubkey3 = await getECDSAPublicKeyFromPrivateKey(privateKey3);

        var issuer = new Issuer(3, poseidon);
        issuer.addAuth(pubkey1.X, pubkey1.Y, pubkey1.type);

        // add pubkey2 and pubkey3 by ecdsa signature
        var inputs2 = (await stateTransitionByEDDSASignature(
            privateKey1,
            issuer,
            [
                { type: "addAuth", ...{ publicKeyX: pubkey2.X, publicKeyY: pubkey2.Y, publicKeyType: pubkey2.type } },
                { type: "addAuth", ...{ publicKeyX: pubkey3.X, publicKeyY: pubkey2.Y, publicKeyType: pubkey3.type } },
                { type: "revokeAuth", ...{ publicKeyX: pubkey3.X } },
                { type: "addClaim", ...{ slot: new Array(8).fill(1) } },
                { type: "revokeClaim", ...{ claimHash: poseidon.F.toString(poseidon(new Array(8).fill(1))) } }
            ]
        ));

        const witness = new Map<number, string>();
        var inputs = object2Array(inputs2);
        console.log(inputs2);
        inputs.forEach((input, index) => {
            witness.set(index + 1, convertToHexAndPad(input));
        });

        //console.log(witness);

        const witnessMap = await executeCircuit(acirBuffer, witness, () => {
            throw Error("unexpected oracle");
        });

        const witnessBuff = compressWitness(witnessMap);

        const proof = await api.acirCreateProof(
            acirComposer,
            acirBufferUncompressed,
            decompressSync(witnessBuff),
            false
        );

        await api.acirInitProvingKey(acirComposer, acirBufferUncompressed);
        const verified = await api.acirVerifyProof(acirComposer, proof, false);

        expect(verified).to.be.true;

    })

    // it("circuit id ownership by signature", async () => {

    //     const messageHash = Buffer.alloc(32, 2);
    //     const prvKey = Buffer.alloc(32, 1);

    //     // const messageHash = Buffer.from(sha256(message).slice(2), "hex");

    //     const pubKey = publicKeyCreate(prvKey, false);

    //     const pubKeyX = pubKey.slice(1, 33);
    //     const pubKeyY = pubKey.slice(33, 65);

    //     const ret = ecdsaSign(messageHash, prvKey);

    //     // console.log(messageHash);

    //     // console.log(pubKeyX, pubKeyY);

    //     // console.log(ret);

    //     var input = {
    //         _public_key_x: Array.from(pubKeyX),
    //         _public_key_y: Array.from(pubKeyY),
    //         _signature: Array.from(ret.signature),
    //         _message_hash: messageHash
    //     }

    //     prove_and_verify(input);
    //     // const recovered = ecdsaRecover(ret.signature, ret.recid, message);
    // })
});
