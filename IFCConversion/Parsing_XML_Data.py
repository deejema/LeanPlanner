import json
import xmltodict
from os import access, write
import requests
import os
# from dotenv import load_dotenv
import pymysql
import time
import datetime
import sys

start_time = time.time()
formattedDecomp = {}
formattedProperties = {}
RDSReadyDict = {}
tableAttributes = {}
singleTableFormat = {}
singleTableCategories = {}

def find_nth(haystack, needle, n):
    start = haystack.find(needle)
    while start >= 0 and n > 1:
        start = haystack.find(needle, start + len(needle))
        n -= 1
    return start

def formatDecomposition(ifcDict):
    if '@id' in ifcDict:
        formattedDecomp[ifcDict['@id']] = []
        if 'IfcPropertySet' in ifcDict:
            for propertyDict in ifcDict['IfcPropertySet']:
                formattedDecomp[ifcDict['@id']].append(propertyDict['@xlink:href'][1:] if propertyDict['@xlink:href'][0]=='#' else propertyDict['@xlink:href'])
        if '@ObjectPlacement' in ifcDict:
            formattedDecomp[ifcDict['@id']].append(ifcDict['@ObjectPlacement'][find_nth(ifcDict['@ObjectPlacement'], " ", 12) + 1:])
    for element in ifcDict.values():
        if isinstance(element, dict):
            formatDecomposition(element)
        elif isinstance(element, list):
            for listElement in element:
                if isinstance(listElement, dict):
                    formatDecomposition(listElement)

def formatProperties(propertiesList):
    for element in propertiesList:
        if '@id' in element:
            if element['@id'] not in formattedProperties:
                formattedProperties[element['@id']] = {}
            if 'IfcPropertySingleValue' in element:
                if isinstance(element['IfcPropertySingleValue'], dict):
                    formattedProperties[element['@id']][element['@Name']] = [element['IfcPropertySingleValue']]
                else:
                    formattedProperties[element['@id']][element['@Name']]= element['IfcPropertySingleValue']
            """
            for propertyEle in element['IfcPropertySingleValue']:
                if isinstance(propertyEle, dict):
                    formattedProperties[element['@id']] = [propertyEle]
                else:
                    formattedProperties[element['@id']] = propertyEle"""

def RDSReady(sensors, properties):
    for sensorKey in sensors:
        RDSReadyDict[sensorKey] = {}
        for propertyID in sensors[sensorKey]:
            if propertyID.count(" ") == 0:
                for propertyCategory in properties[propertyID]:
                    if ('[' + propertyCategory + ']') not in RDSReadyDict[sensorKey]:
                        RDSReadyDict[sensorKey]['[' + propertyCategory + ']'] = {}
                    if ('[' + propertyCategory + ']') not in tableAttributes:
                        tableAttributes['[' + propertyCategory + ']'] = {}
                    """
                    if ('[' + propertyCategory + ']').upper() not in (name.upper() for name in RDSReadyDict[sensorKey]):
                        RDSReadyDict[sensorKey]['[' + propertyCategory + ']'] = {}
                    if ('[' + propertyCategory + ']').upper() not in (name.upper() for name in tableAttributes):
                        tableAttributes['[' + propertyCategory + ']'] = {}"""
                    if len(sensors[sensorKey][-1]) >= 1:
                        RDSReadyDict[sensorKey]['[' + propertyCategory + ']']['ObjectPlacement'] = sensors[sensorKey][-1]
                        tableAttributes['[' + propertyCategory + ']']['ObjectPlacement'] = 'text'
                    for propertySubCategory in properties[propertyID][propertyCategory]:
                        if '@Name' in propertySubCategory and '@NominalValue' in propertySubCategory:
                            propertyName = propertySubCategory['@Name']
                            """
                            if propertyName.upper() in (name.upper() for name in RDSReadyDict[sensorKey]['[' + propertyCategory + ']']) or \
                                    propertyName.upper() in (name.upper() for name in tableAttributes['[' + propertyCategory + ']']):
                                propertyName = propertySubCategory['@Name'] + '(1)'"""
                            RDSReadyDict[sensorKey]['[' + propertyCategory + ']'][propertyName] = propertySubCategory['@NominalValue']
                            if type(propertySubCategory['@NominalValue']).__name__ == "NoneType" or type(propertySubCategory['@NominalValue']).__name__ == "str":
                                tableAttributes['[' + propertyCategory + ']'][propertyName] = 'text'
                            else:
                                tableAttributes['[' + propertyCategory + ']'][propertyName] = type(propertySubCategory['@NominalValue']).__name__
                        RDSReadyDict[sensorKey]['[' + propertyCategory + ']']['id'] = sensorKey
                        tableAttributes['[' + propertyCategory + ']']['id'] = 'text'
            """else:
                for propertyCategory in properties[propertyID]:
                    RDSReadyDict[sensorKey]['[' + propertyCategory + ']'] = {}
                    tableAttributes['[' + propertyCategory + ']'] = {}
                    RDSReadyDict[sensorKey]['[' + propertyCategory + ']']['ObjectPlacement'] = propertyID
                    tableAttributes['[' + propertyCategory + ']']['ObjectPlacement'] = 'text'"""

def createTable(tableColAttributes):
    db = pymysql.connect(host='ifc-test-info.csx7ghhxsuej.us-east-1.rds.amazonaws.com',
                         user='admin', password='password', database="Test", port=3306)
    cursor = db.cursor()

    for category in tableColAttributes:
        sql = 'CREATE TABLE IF NOT EXISTS `' + category + "` ( "
        for colName in tableColAttributes[category]:
            sqlInput = "`" + colName + "` " + tableColAttributes[category][colName] + ', '
            sql += sqlInput
        sql = sql[:-2]
        sql += " )"
        cursor.execute(sql)

def insertIntoRDS(sensorDict):
    db = pymysql.connect(host='ifc-test-info.csx7ghhxsuej.us-east-1.rds.amazonaws.com',
                         user='admin', password='password', database="Test", port=3306)
    cursor = db.cursor()
    for sensor in sensorDict:
        if len(sensorDict[sensor].keys()) >= 1:
            for category in sensorDict[sensor]:
                columnsList = list(sensorDict[sensor][category].keys())
                for i in range(len(columnsList)):
                    if ' ' in columnsList[i] or '-' in columnsList[i]:
                        columnsList[i] = '`' + columnsList[i] + '`'
                columns = ', '.join(columnsList)
                placeholders = ', '.join(['%s'] * len(sensorDict[sensor][category]))
                sql = "INSERT INTO `%s` ( %s ) VALUES ( %s )" % (category, columns, placeholders)
                print(sql)
                cursor.execute(sql, list(sensorDict[sensor][category].values()))
        db.commit()

def formatSingleTable(RDSReady):
    for id in RDSReady:
        if id not in singleTableFormat:
            singleTableFormat[id] = {}
            for category in RDSReady[id]:
                for attribute in RDSReady[id][category]:
                    if attribute not in singleTableFormat[id]:
                        if RDSReady[id][category][attribute]:
                            singleTableFormat[id][attribute] = RDSReady[id][category][attribute]
                        else:
                            singleTableFormat[id][attribute] = " "
                    if attribute not in singleTableCategories:
                        singleTableCategories[attribute] = "text"

def singleTable(categories, data, projName):
    db = pymysql.connect(host='ifc-test-info.csx7ghhxsuej.us-east-1.rds.amazonaws.com',
                        user='admin', password='password', database="Test", port=3306)
    cursor = db.cursor()
    sql = 'CREATE TABLE IF NOT EXISTS `' + projName + "` ( "
    for category in categories:
        sqlInput = "`" + category + "` " + categories[category] + ', '
        sql += sqlInput
    sql = sql[:-2]
    sql += " )"
    cursor.execute(sql)
    db.commit()

    for id in data:
        columnList = list(data[id].keys())
        for i in range(len(columnList)):
            if ' ' in columnList[i] or '-' in columnList[i]:
                columnList[i] = '`' + columnList[i] + '`'
        columns = ', '.join(columnList)
        placeholders = ', '.join(['%s'] * len(data[id]))
        sql = "INSERT INTO `Input` ( %s ) VALUES ( {} )" % (columns)
        valueList = list(data[id].values())
        for i in range(len(valueList)):
            valueList[i] = "'" + valueList[i] + "'"
        print(valueList)
        values = ", ".join(valueList)
        if values:
            sql = sql.format(values)
            print(sql)
            cursor.execute(sql)
    db.commit()


def writeToJson(d):
    with open("sample.json", "w") as outfile:
        json.dump(d, outfile)

"""
with open('ICC-MEP-1F.json') as json_file:
    data = json.load(json_file)

    # Print the type of data variable
    print("Type:", type(data))
    returnList= []
    for sensorDict in data['metaObjects']:
        returnList.append(sensorDict['id'])
    print(returnList)


with open('ICC-MEP-1F.xml', encoding="utf8") as xml_file:
    data_dict = xmltodict.parse(xml_file.read())
    print(data_dict)
    propertySet = data_dict['ifc']['properties']['IfcPropertySet']
    decomposition = data_dict['ifc']['decomposition']['IfcProject']
    print(propertySet)
    print(decomposition)
"""

def main(xml_files, json_files, projName):
    xml_files = xml_files.split(",")
    json_files = json_files.split(",")
    for i in range(len(xml_files)):
        json_file = json_files[i]
        xml_file = xml_files[i]
        with open(json_file) as json_file: # 'ICC-ARC-STR-17F-1702.json'
            data = json.load(json_file)

            # Print the type of data variable
            print("Type:", type(data))
            returnList= []
            for sensorDict in data['metaObjects']:
                returnList.append(sensorDict['id'])
            print(returnList)


        with open(xml_file, encoding="utf8") as xml_file: # 'ICC-ARC-STR-17F-1702.xml'
            data_dict = xmltodict.parse(xml_file.read())
            print(data_dict)
            propertySet = data_dict['ifc']['properties']['IfcPropertySet']
            decomposition = data_dict['ifc']['decomposition']['IfcProject']
            print(propertySet)
            print(decomposition)

        formatDecomposition(decomposition)
        print(formattedDecomp)
        print(len(formattedDecomp.keys()))
        print(len(returnList))
        print(all(elem in formattedDecomp.keys() for elem in returnList))
        counter = 0
        for ele in formattedDecomp.values():
            if isinstance(ele, list):
                counter +=1
        print(counter)


        formatProperties(propertySet)
        print(len(propertySet))
        print(len(formattedProperties.keys()))
        print(formattedProperties)



        RDSReady(formattedDecomp, formattedProperties)
        print(RDSReadyDict)
        print(tableAttributes)

        print("test")
        formatSingleTable(RDSReadyDict)
        # createTable(tableAttributes)
        # insertIntoRDS(RDSReadyDict)
        singleTable(singleTableCategories, singleTableFormat, projName)

        print("--- %s seconds ---" % (time.time() - start_time))


if __name__ == "__main__":
    args = sys.argv[1:]
    print(args)
    args[0] = args[0][1:len(args[0])-1]
    args[1] = args[1][1:len(args[1])-1]
    main(args[0], args[1], args[2])