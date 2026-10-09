// Synthetic only. Measures response/lookup budgets, never production latency or billing.
import assert from 'node:assert/strict';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { McpQueries } from '../functions/lib/mcp/queries.js';
import { createMcpServer } from '../functions/lib/mcp/server.js';
const actor={uid:'synthetic',employeeId:'synthetic',sessionVersion:1,permissionsVersion:1,roleScopes:['delivery'],isAdmin:false};
const events=Array.from({length:100},(_,i)=>({eventId:`10000000-0000-4000-8000-${String(i).padStart(12,'0')}`,productId:`product-${i}`,actorEmployeeId:'synthetic',kind:'count_match',locationId:'freezer1',createdAt:'2026-10-09T01:00:00.000Z',cycleId:'synthetic-cycle',unitLabel:'봉',stockRevision:1,lines:[],reason:''}));
let productReads=0,authorReads=0,eventQueries=0;
const queries=new McpQueries({}, {}, {}, {namesByIds:async ids=>{authorReads+=ids.length;return new Map(ids.map(id=>[id,'합성 기록자']));}}, {
  search:async()=>{eventQueries++;return {events,asOf:'2026-10-09T03:00:00.000Z',nextCursor:null,page:{returnedCount:100,complete:true,hasMore:false,startedFromBeginning:true,recordsScanned:100,pagesScanned:1,stoppedBecause:'complete'}};},
  productNames:async ids=>{productReads+=new Set(ids).size;return new Map(ids.map(id=>[id,{name:'합성 상품',status:'active'}]));},
});
const server=createMcpServer(actor,async()=>{},queries),client=new Client({name:'record-budget',version:'1'});
const [ct,st]=InMemoryTransport.createLinkedPair();await server.connect(st);await client.connect(ct);
const reports=[];
try{for(const includeRecords of [true,false]){productReads=0;authorReads=0;eventQueries=0;
const result=await client.callTool({name:'search_inventory_records',arguments:{fromDate:'2026-10-09',throughDate:'2026-10-09',limit:100,includeRecords}});
assert(!result.isError);assert.equal(result.structuredContent.summary[0].quantityMatches,100);
assert.equal(result.structuredContent.recordsIncluded,includeRecords);
reports.push({mode:includeRecords?'records':'summary',toolCalls:1,eventQueries,eventDocuments:100,productNameDocuments:productReads,authorDocuments:authorReads,responseBytes:Buffer.byteLength(JSON.stringify(result))});}
assert.equal(reports[0].productNameDocuments,100);assert.equal(reports[1].productNameDocuments,0);
assert(reports[1].responseBytes<reports[0].responseBytes/5);console.log(JSON.stringify({synthetic:true,reports},null,2));
}finally{await client.close();await server.close();}
