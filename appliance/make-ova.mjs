// Package a stream-optimized VMDK into an OVA that both VirtualBox and VMware
// Workstation import. Usage:
//   node appliance/make-ova.mjs <disk.vmdk> <capacity-GiB> <version> <out.ova>
// Requires `tar` on PATH. The OVF is listed first in the archive, as OVF 1.0
// requires, followed by the manifest and the disk.
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { copyFile, mkdtemp, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export function ovfDescriptor({ diskFile, diskBytes, capacityGiB, version }) {
  const esc = (s) => String(s).replace(/[<>&"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' })[c]);
  return `<?xml version="1.0" encoding="UTF-8"?>
<Envelope vmw:buildId="material-qemu" xmlns="http://schemas.dmtf.org/ovf/envelope/1" xmlns:cim="http://schemas.dmtf.org/wbem/wscim/1/common" xmlns:ovf="http://schemas.dmtf.org/ovf/envelope/1" xmlns:rasd="http://schemas.dmtf.org/wbem/wscim/1/cim-schema/2/CIM_ResourceAllocationSettingData" xmlns:vmw="http://www.vmware.com/schema/ovf" xmlns:vssd="http://schemas.dmtf.org/wbem/wscim/1/cim-schema/2/CIM_VirtualSystemSettingData" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <References>
    <File ovf:href="${esc(diskFile)}" ovf:id="file1" ovf:size="${diskBytes}"/>
  </References>
  <DiskSection>
    <Info>Virtual disk information</Info>
    <Disk ovf:capacity="${capacityGiB}" ovf:capacityAllocationUnits="byte * 2^30" ovf:diskId="vmdisk1" ovf:fileRef="file1" ovf:format="http://www.vmware.com/interfaces/specifications/vmdk.html#streamOptimized"/>
  </DiskSection>
  <NetworkSection>
    <Info>The list of logical networks</Info>
    <Network ovf:name="bridged">
      <Description>The LAN the appliance joins</Description>
    </Network>
  </NetworkSection>
  <VirtualSystem ovf:id="material-qemu">
    <Info>Material QEMU appliance ${esc(version)}</Info>
    <Name>material-qemu</Name>
    <ProductSection>
      <Info>Product information</Info>
      <Product>Material QEMU appliance</Product>
      <Version>${esc(version)}</Version>
      <ProductUrl>https://github.com/Ding-Ding-Projects/material-qemu</ProductUrl>
    </ProductSection>
    <OperatingSystemSection ovf:id="96" vmw:osType="debian12_64Guest">
      <Info>The kind of installed guest operating system</Info>
      <Description>Debian 64-bit</Description>
    </OperatingSystemSection>
    <VirtualHardwareSection>
      <Info>Virtual hardware requirements</Info>
      <System>
        <vssd:ElementName>Virtual Hardware Family</vssd:ElementName>
        <vssd:InstanceID>0</vssd:InstanceID>
        <vssd:VirtualSystemIdentifier>material-qemu</vssd:VirtualSystemIdentifier>
        <vssd:VirtualSystemType>vmx-14</vssd:VirtualSystemType>
      </System>
      <Item>
        <rasd:AllocationUnits>hertz * 10^6</rasd:AllocationUnits>
        <rasd:Description>Number of Virtual CPUs</rasd:Description>
        <rasd:ElementName>2 virtual CPU(s)</rasd:ElementName>
        <rasd:InstanceID>1</rasd:InstanceID>
        <rasd:ResourceType>3</rasd:ResourceType>
        <rasd:VirtualQuantity>2</rasd:VirtualQuantity>
      </Item>
      <Item>
        <rasd:AllocationUnits>byte * 2^20</rasd:AllocationUnits>
        <rasd:Description>Memory Size</rasd:Description>
        <rasd:ElementName>4096MB of memory</rasd:ElementName>
        <rasd:InstanceID>2</rasd:InstanceID>
        <rasd:ResourceType>4</rasd:ResourceType>
        <rasd:VirtualQuantity>4096</rasd:VirtualQuantity>
      </Item>
      <Item>
        <rasd:Address>0</rasd:Address>
        <rasd:Description>SCSI Controller</rasd:Description>
        <rasd:ElementName>SCSI Controller 0</rasd:ElementName>
        <rasd:InstanceID>3</rasd:InstanceID>
        <rasd:ResourceSubType>lsilogic</rasd:ResourceSubType>
        <rasd:ResourceType>6</rasd:ResourceType>
      </Item>
      <Item>
        <rasd:AddressOnParent>0</rasd:AddressOnParent>
        <rasd:ElementName>Hard Disk 1</rasd:ElementName>
        <rasd:HostResource>ovf:/disk/vmdisk1</rasd:HostResource>
        <rasd:InstanceID>4</rasd:InstanceID>
        <rasd:Parent>3</rasd:Parent>
        <rasd:ResourceType>17</rasd:ResourceType>
      </Item>
      <Item>
        <rasd:AddressOnParent>7</rasd:AddressOnParent>
        <rasd:AutomaticAllocation>true</rasd:AutomaticAllocation>
        <rasd:Connection>bridged</rasd:Connection>
        <rasd:Description>E1000 ethernet adapter on "bridged"</rasd:Description>
        <rasd:ElementName>Ethernet 1</rasd:ElementName>
        <rasd:InstanceID>5</rasd:InstanceID>
        <rasd:ResourceSubType>E1000</rasd:ResourceSubType>
        <rasd:ResourceType>10</rasd:ResourceType>
      </Item>
    </VirtualHardwareSection>
  </VirtualSystem>
</Envelope>
`;
}

async function sha256File(file) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return hash.digest('hex');
}

export async function makeOva(vmdk, capacityGiB, version, out) {
  const work = await mkdtemp(path.join(tmpdir(), 'ova-'));
  try {
    const base = 'material-qemu';
    const diskFile = `${base}-disk1.vmdk`;
    await copyFile(vmdk, path.join(work, diskFile));
    const diskBytes = (await stat(path.join(work, diskFile))).size;
    const ovf = ovfDescriptor({ diskFile, diskBytes, capacityGiB, version });
    await writeFile(path.join(work, `${base}.ovf`), ovf);
    const ovfSha = createHash('sha256').update(ovf).digest('hex');
    const diskSha = await sha256File(path.join(work, diskFile));
    await writeFile(path.join(work, `${base}.mf`), `SHA256(${base}.ovf)= ${ovfSha}\nSHA256(${diskFile})= ${diskSha}\n`);
    execFileSync('tar', ['--format=ustar', '-cf', path.resolve(out), '-C', work, `${base}.ovf`, `${base}.mf`, diskFile], { stdio: 'inherit' });
  } finally {
    await rm(work, { recursive: true, force: true });
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [vmdk, capacity, version, out] = process.argv.slice(2);
  if (!vmdk || !capacity || !version || !out) {
    console.error('Usage: node appliance/make-ova.mjs <disk.vmdk> <capacity-GiB> <version> <out.ova>');
    process.exit(2);
  }
  await makeOva(vmdk, Number(capacity), version, out);
  console.log(`OVA written to ${out}`);
}
