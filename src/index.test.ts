import { expect } from "chai";
import { buildPoseidon } from "./crypto/poseidon_wasm.js"
import { IndexedMerkleTree } from "./tree/indexedMerkleTree.js";
import { prove_and_verify } from "./utils/runCircuit.js";
import { Holder } from "./state/state.js";
import { getPublicKeyFromPrivateKey, idOwnershipBySignature } from "./witness/authen.js";


describe("test", () => {
    let poseidon: any;
    before(async () => {
        poseidon = await buildPoseidon();
    })

    it("poseidon", async () => {
        const res = poseidon([1, 2]);
        expect(poseidon.F.toString(res)).equal(BigInt("0x115cc0f5e7d690413df64c6b9662e9cf2a3617f2743245519e19607a4417189a").toString(10));
    })

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

    })

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

    it("circuit id ownership by signature", async () => {

        var privateKey1 = BigInt(123456);
        var privateKey2 = BigInt(12345);
        var privateKey3 = BigInt(1234);

        var pubkey1 = await getPublicKeyFromPrivateKey(privateKey1);
        var pubkey2 = await getPublicKeyFromPrivateKey(privateKey2);
        var pubkey3 = await getPublicKeyFromPrivateKey(privateKey3);

        var holder = new Holder(3, poseidon);
        holder.addAuth(pubkey1.publicKeyX, pubkey1.publicKeyY);
        holder.addAuth(pubkey2.publicKeyX, pubkey2.publicKeyY);
        holder.addAuth(pubkey3.publicKeyX, pubkey3.publicKeyY);

        holder.revokeAuth(pubkey1.publicKeyX, pubkey1.publicKeyY);
        holder.revokeAuth(pubkey2.publicKeyX, pubkey2.publicKeyY);

        const challenge = BigInt('1234565');

        var input = await idOwnershipBySignature(privateKey3, holder, challenge);

        console.log(input);
        if (input != null) prove_and_verify(input);
    })
})


